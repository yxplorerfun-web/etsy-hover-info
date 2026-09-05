(() => {
"use strict";

const ID = "etsy-hover-info-box";
let box = null, active = null, timer = null;
const cache = new Map();
const clean = s => (s || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function ui(){
  if(box) return box;
  box=document.createElement("div"); box.id=ID;
  box.innerHTML=`
    <div class="title">Etsy Listing Info</div>
    <div class="row"><span>Store Age</span><b id="age">Loading...</b></div>
    <div class="row"><span>Total Sales</span><b id="sales">Loading...</b></div>
    <div class="row reviews-row"><span>Reviews</span><b id="reviews">Loading...</b></div>
    <div class="row"><span>Shipping From</span><b id="ship">Loading...</b></div>`;
  document.body.appendChild(box); return box;
}
function set(k,v){const e=ui().querySelector("#"+k); if(e)e.innerHTML=v||"Not found";}
function place(card){
  const r=card.getBoundingClientRect(), b=ui(), w=300, h=220;
  let x=r.right+10; if(x+w>innerWidth-8)x=Math.max(8,r.left-w-10);
  let y=Math.max(8,Math.min(r.top,innerHeight-h-8));
  b.style.left=x+"px"; b.style.top=y+"px"; b.style.display="block";
}
function hide(){clearTimeout(timer);timer=setTimeout(()=>{if(box)box.style.display="none";active=null},180)}
function text(node){return clean(node?.innerText||node?.textContent||"")}
function findCard(el){
  for(let i=0;el&&el!==document.body&&i<14;i++,el=el.parentElement){
    if(el.querySelector?.('a[href*="/listing/"]')){const r=el.getBoundingClientRect();if(r.width>120&&r.height>80)return el}
  } return null;
}
function listingUrl(card){
  const a=card.querySelector('a[href*="/listing/"]'); if(!a)return null;
  try{const u=new URL(a.href,location.href);u.search="";u.hash="";return u.href}catch{return null}
}
async function get(url){
  if(!url)return null; if(cache.has(url))return cache.get(url);
  const p=fetch(url,{credentials:"include",cache:"force-cache"}).then(r=>r.ok?r.text():"").then(h=>h?new DOMParser().parseFromString(h,"text/html"):null).catch(()=>null);
  cache.set(url,p); return p;
}

function scriptText(doc){return [...doc.querySelectorAll("script")].map(s=>s.textContent||"").join("\n")}
function firstMatch(str, patterns){for(const p of patterns){const m=str.match(p);if(m&&m[1])return clean(m[1])}return null}
function normalizeCount(v){if(!v)return null; return clean(v).replace(/\s+/g,"")}

function ratingAndReviews(doc){
  const raw=scriptText(doc);
  let rating=firstMatch(raw,[
    /"ratingValue"\s*:\s*"?([0-5](?:\.\d+)?)"?/i,
    /"rating_value"\s*:\s*"?([0-5](?:\.\d+)?)"?/i,
    /"averageRating"\s*:\s*"?([0-5](?:\.\d+)?)"?/i,
    /"average_rating"\s*:\s*"?([0-5](?:\.\d+)?)"?/i
  ]);
  let count=firstMatch(raw,[
    /"reviewCount"\s*:\s*"?([\d,.]+(?:[KMB])?)"?/i,
    /"review_count"\s*:\s*"?([\d,.]+(?:[KMB])?)"?/i,
    /"numReviews"\s*:\s*"?([\d,.]+(?:[KMB])?)"?/i,
    /"numberOfReviews"\s*:\s*"?([\d,.]+(?:[KMB])?)"?/i,
    /"reviewsCount"\s*:\s*"?([\d,.]+(?:[KMB])?)"?/i
  ]);
  // JSON-LD aggregateRating
  for(const s of doc.querySelectorAll('script[type="application/ld+json"]')){
    try{
      const j=JSON.parse(s.textContent||""); const arr=Array.isArray(j)?j:[j];
      for(const x of arr){const a=x?.aggregateRating;if(a){rating=rating||a.ratingValue;count=count||a.reviewCount;}}
    }catch{}
  }
  const body=text(doc.body);
  if(!rating){rating=firstMatch(body,[/(?:^|\s)([0-5](?:\.\d+)?)\s*(?:\/\s*5)?\s*(?:stars?|out of 5)/i,/\b([0-5]\.\d)\s*(?:stars?|rating)\b/i])}
  if(!count){count=firstMatch(body,[/\(([\d,.]+(?:K|M)?)\)\s*(?:reviews?|ratings?)/i,/([\d,.]+(?:K|M)?)\s+(?:reviews?|ratings?)\b/i])}
  if(rating && Number(rating)>=0 && Number(rating)<=5) rating=Number(rating).toFixed(1);
  return {rating:rating?String(rating):null,count:count?normalizeCount(count):null};
}

function salesFromDoc(doc){
  const raw=scriptText(doc);
  const v=firstMatch(raw,[
    /"totalSales"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i,
    /"total_sales"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i,
    /"salesCount"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i,
    /"sales_count"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i,
    /"numSales"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i,
    /"numberOfSales"\s*:\s*"?([\d,.]+(?:\.\d+)?\s*[KMB]?)"?/i
  ]); if(v)return clean(v);
  return firstMatch(text(doc.body),[/\b([\d,.]+(?:\.\d+)?\s*[KMB]?)\s+sales\b/i,/\b(?:sales|items?\s+sold)\s*[:\-]\s*([\d,.]+(?:\.\d+)?\s*[KMB]?)/i]);
}

function shippingFrom(doc){
  const raw=scriptText(doc);
  let v=firstMatch(raw,[
    /"shipsFrom"\s*:\s*"([^"]+)"/i,
    /"ships_from"\s*:\s*"([^"]+)"/i,
    /"shippingOrigin"\s*:\s*"([^"]+)"/i,
    /"shipping_origin"\s*:\s*"([^"]+)"/i,
    /"itemLocation"\s*:\s*"([^"]+)"/i,
    /"item_location"\s*:\s*"([^"]+)"/i,
    /"originCountry"\s*:\s*"([^"]+)"/i
  ]);
  if(v) return clean(v).replace(/^from\s+/i,"");
  const nodes=[...doc.querySelectorAll("div,span,p,li")];
  for(const n of nodes){
    const s=clean(text(n));
    if(s.length>180)continue;
    const m=s.match(/\bships?\s+from\s*:?\s*([^|•·]+?)(?=\s+(?:and\s+)?(?:delivered|delivery|arrives?|estimated|by)\b|$)/i);
    if(m){v=clean(m[1]).replace(/[|•·]+$/g,"").trim(); if(v && v.length<=80)return v;}
  }
  return firstMatch(text(doc.body),[/\bships?\s+from\s*:?\s*([^|•·]+?)(?=\s+(?:and\s+)?(?:delivered|delivery|arrives?|estimated|by)\b|$)/i]);
}

function storeAge(doc){
  const raw=scriptText(doc), body=text(doc.body);
  let s=firstMatch(raw,[
    /"shopCreationDate"\s*:\s*"([^"]+)"/i,
    /"shop_creation_date"\s*:\s*"([^"]+)"/i,
    /"creationDate"\s*:\s*"([^"]+)"/i,
    /"shopOpenDate"\s*:\s*"([^"]+)"/i
  ]);
  let d=s?new Date(s):null;
  if(!d||isNaN(d)){
    const m=body.match(/\b(?:on\s+etsy\s+since|since)\s+([A-Za-z]{3,9})\s+(\d{4})\b/i);
    if(m){const months={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};d=new Date(Number(m[2]),months[m[1].toLowerCase()]??0,1)}
  }
  if(!d||isNaN(d)){
    const y=body.match(/\b(?:on\s+etsy\s+since|since)\s+(\d{4})\b/i); if(y)d=new Date(Number(y[1]),0,1);
  }
  if(!d||isNaN(d))return null;
  const years=(Date.now()-d.getTime())/31557600000;
  if(years<0)return null;
  return years<1 ? "Less than 1 year" : `${Math.floor(years)} year${Math.floor(years)===1?"":"s"}`;
}
function shopUrl(doc){for(const a of doc.querySelectorAll("a[href]")){const h=a.href||"";if(/etsy\.com\/shop\/[^/?#]+/i.test(h))return h.split("?")[0]}return null}

async function inspect(card){
  active=card; place(card); ["age","sales","reviews","ship"].forEach(k=>set(k,"Loading..."));
  const listing=listingUrl(card); let data={age:null,sales:null,reviews:null,ship:null};
  const doc=await get(listing);
  if(doc){
    data.age=storeAge(doc); data.sales=salesFromDoc(doc); data.reviews=ratingAndReviews(doc); data.ship=shippingFrom(doc);
    const shop=shopUrl(doc);
    if(shop && (!data.age||!data.sales||!data.reviews?.count||!data.ship)){
      const sd=await get(shop); if(sd){data.age=data.age||storeAge(sd);data.sales=data.sales||salesFromDoc(sd);const rr=ratingAndReviews(sd);data.reviews={rating:data.reviews?.rating||rr.rating,count:data.reviews?.count||rr.count};data.ship=data.ship||shippingFrom(sd)}
    }
  }
  if(!data.sales)data.sales=salesFromDoc(card);
  if(!data.reviews?.count){const rr=ratingAndReviews(card);data.reviews=data.reviews||{};data.reviews.count=rr.count;data.reviews.rating=data.reviews.rating||rr.rating}
  if(!data.ship)data.ship=shippingFrom(card);
  if(active!==card)return;
  set("age",data.age||"Not found");
  set("sales",data.sales||"Not found");
  if(data.reviews?.rating && data.reviews?.count) set("reviews",`<span class="stars">★</span> ${esc(data.reviews.rating)} <span class="review-count">(${esc(data.reviews.count)})</span>`);
  else if(data.reviews?.count) set("reviews",`<span class="stars">★</span> <span class="review-count">(${esc(data.reviews.count)})</span>`);
  else if(data.reviews?.rating) set("reviews",`<span class="stars">★</span> ${esc(data.reviews.rating)}`);
  else set("reviews","Not found");
  set("ship",data.ship?esc(data.ship):"Not found");
}

document.addEventListener("mouseover",e=>{if(box?.contains(e.target))return;const card=findCard(e.target);if(!card||card===active)return;inspect(card)},true);
document.addEventListener("mouseout",e=>{const card=findCard(e.target);if(card&&!card.contains(e.relatedTarget))hide()},true);
addEventListener("scroll",()=>{if(active&&box?.style.display==="block")place(active)},{passive:true});
addEventListener("resize",()=>{if(active&&box?.style.display==="block")place(active)});
})();
