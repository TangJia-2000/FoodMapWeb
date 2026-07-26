
const CONFIG = window.APP_CONFIG || {};
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

const state = {
  records: [], filtered: [], favorites: new Set(JSON.parse(localStorage.getItem('wfm:favorites') || '[]')),
  view: 'map', search: '', category: '', district: '', recommend: '', price: '', geoOnly: false,
  sort: 'recommend', location: null, amap: null, map: null, markers: [], markerCluster: null, locationMarker: null,
  deferredInstallPrompt: null, selectedId: null, initialFitDone: false
};

const categoryEmoji = {
  '早餐':'🥣','五谷杂粮':'🍜','烧烤':'🍢','烤肉':'🥩','日式烧鸟&日料':'🍣','粤&闽菜&潮汕火锅':'🥘',
  '西餐':'🍽️','自助餐':'🦞','火锅':'🍲','苍蝇馆子':'🥡','面包甜点':'🥐','私房菜':'🥢','韩国菜':'🍖',
  '泰国菜':'🌶️','湖北菜':'🐟','其他国家菜':'🌮','银泰专栏':'🏬'
};
const recRank = {'必吃':6,'推荐':5,'可以试试':4,'可尝':4,'7':3,'一般':2,'不推荐':0,'':1};

function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function hasCoords(r){ return window.FoodMapCore.isReliableCoordinate(r); }
function formatPrice(r){ return r.priceText ? `￥${r.priceText}` : (r.price ? `约￥${Math.round(r.price)}` : '价格未录入'); }
function recClass(v){ return v==='必吃'?'must':''; }
function iconFor(r){ return categoryEmoji[r.category] || '🍴'; }
function saveFavorites(){ localStorage.setItem('wfm:favorites', JSON.stringify([...state.favorites])); updateSummary(); }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2200); }
function openDialog(id){ const d=$(`#${id}`); if(d && !d.open) d.showModal(); }
function closeDialog(id){ const d=$(`#${id}`); if(d?.open) d.close(); }

function haversine(a,b){ return window.FoodMapCore.haversine(a,b); }
function distanceFor(r){ if(!state.location || !hasCoords(r)) return null; return haversine(state.location,{lng:Number(r.longitude),lat:Number(r.latitude)}); }
function formatDistance(m){ return window.FoodMapCore.formatDistance(m); }

function filterRecords(){
  const q=state.search.trim().toLowerCase();
  const priceRange=state.price ? state.price.split('-').map(Number) : null;
  state.filtered=state.records.filter(r=>window.FoodMapCore.matchesFilters(r,{search:q,category:state.category,district:state.district,recommend:state.recommend,price:state.price,geoOnly:state.geoOnly}));
  sortRecords(); renderAll();
}
function sortRecords(){
  const arr=state.filtered;
  if(state.sort==='distance' && state.location) arr.sort((a,b)=>(distanceFor(a)??Infinity)-(distanceFor(b)??Infinity));
  else if(state.sort==='priceAsc') arr.sort((a,b)=>(a.price||Infinity)-(b.price||Infinity));
  else if(state.sort==='priceDesc') arr.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(state.sort==='recommend') arr.sort((a,b)=>(recRank[b.recommend]||0)-(recRank[a.recommend]||0) || a.id-b.id);
  else arr.sort((a,b)=>a.id-b.id);
}

function cardHtml(r){
  const dist=distanceFor(r);
  return `<button class="restaurant-card" type="button" data-id="${r.id}">
    <span class="food-icon">${iconFor(r)}</span>
    <span class="card-body"><span class="card-title-row"><strong>${escapeHtml(r.name)}</strong>${r.recommend?`<span class="tag ${recClass(r.recommend)}">${escapeHtml(r.recommend)}</span>`:''}</span>
    <p>${escapeHtml([r.district,r.address].filter(Boolean).join(' · ') || '地点待补充')}</p><p>${escapeHtml(r.feature || r.cuisine || r.category)}</p></span>
    <span class="card-side"><strong>${formatPrice(r)}</strong><span>${dist==null?(hasCoords(r)?'可定位后排序':'待匹配坐标'):formatDistance(dist)}</span></span>
  </button>`;
}
function renderList(target, records){
  const el=$(target); el.innerHTML=records.map(cardHtml).join('');
  $$('.restaurant-card',el).forEach(btn=>btn.addEventListener('click',()=>openDetail(Number(btn.dataset.id))));
}
function renderNearby(){
  let rows=state.filtered.filter(hasCoords);
  if(state.location) rows=[...rows].sort((a,b)=>distanceFor(a)-distanceFor(b));
  else rows=rows.slice(0,12);
  $('#nearbyRail').innerHTML=rows.slice(0,10).map(r=>`<button class="nearby-card" type="button" data-id="${r.id}"><span class="row"><strong>${escapeHtml(r.name)}</strong><span>${formatPrice(r)}</span></span><p>${state.location?formatDistance(distanceFor(r)):escapeHtml(r.district||r.category)} · ${escapeHtml(r.feature||r.address||'查看详情')}</p></button>`).join('');
  $$('.nearby-card').forEach(btn=>btn.addEventListener('click',()=>openDetail(Number(btn.dataset.id))));
}
function updateSummary(){
  $('#resultCount').textContent=state.filtered.length;
  $('#geoCount').textContent=state.records.filter(hasCoords).length;
  $('#favCount').textContent=state.favorites.size;
  const active=[state.category,state.district,state.recommend,state.price,state.geoOnly?'geo':''].filter(Boolean).length;
  $('#filterCount').textContent=active; $('#filterCount').classList.toggle('hidden',!active);
}
function renderAll(){
  updateSummary(); renderList('#restaurantList',state.filtered);
  $('#emptyState').classList.toggle('hidden',state.filtered.length>0);
  $('#restaurantList').classList.toggle('hidden',state.filtered.length===0);
  $('#resultHint').textContent=`显示 ${state.filtered.length} / ${state.records.length} 家${state.location?' · 已按当前位置计算距离':''}`;
  const favRows=state.records.filter(r=>state.favorites.has(r.id));
  renderList('#favoritesList',favRows); $('#favoritesList').classList.toggle('hidden',!favRows.length); $('#favoritesEmpty').classList.toggle('hidden',favRows.length>0);
  renderNearby(); renderMapMarkers();
}

function setView(view){
  state.view=view;
  ['map','list','favorites','stats'].forEach(v=>{
    $(`#${v}View`)?.classList.toggle('active',v===view);
    $(`.nav-btn[data-view="${v}"]`)?.classList.toggle('active',v===view);
  });
  if(view==='map' && state.map) setTimeout(()=>state.map.resize(),50);
  if(view==='stats') renderStats();
}

function detailNavigationLinks(r){ return window.FoodMapCore.navigationLinks(r,CONFIG); }
function openDetail(id){
  const r=state.records.find(x=>x.id===id); if(!r) return;
  state.selectedId=id; const dist=distanceFor(r), links=detailNavigationLinks(r), isFav=state.favorites.has(id);
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  $('#detailContent').innerHTML=`<div class="detail-hero"><span class="food-icon">${iconFor(r)}</span><div><h2>${escapeHtml(r.name)}</h2><p>${escapeHtml([r.category,r.district,r.cuisine].filter(Boolean).join(' · '))}</p></div></div>
    <div class="detail-tags">${r.recommend?`<span class="tag ${recClass(r.recommend)}">${escapeHtml(r.recommend)}</span>`:''}${r.environment?`<span class="tag">环境：${escapeHtml(r.environment)}</span>`:''}${r.party?`<span class="tag">${escapeHtml(r.party)} 人</span>`:''}${hasCoords(r)?'<span class="tag">地图坐标已匹配</span>':'<span class="tag">地图坐标待匹配</span>'}</div>
    <div class="detail-grid"><div class="detail-cell"><span>人均</span><strong>${formatPrice(r)}</strong></div><div class="detail-cell"><span>离我距离</span><strong>${formatDistance(dist)}</strong></div><div class="detail-cell"><span>地址</span><strong>${escapeHtml(r.address||'待补充')}</strong></div><div class="detail-cell"><span>包间</span><strong>${escapeHtml(r.privateRoom||'未记录')}</strong></div></div>
    ${r.feature?`<section class="detail-section"><h3>特色菜</h3><p>${escapeHtml(r.feature)}</p></section>`:''}
    ${r.reason?`<section class="detail-section"><h3>推荐理由</h3><p>${escapeHtml(r.reason)}</p></section>`:''}
    <div class="detail-actions"><button id="favoriteDetailBtn" type="button">${isFav?'★ 已收藏':'☆ 收藏'}</button><button id="copyAddressBtn" type="button">复制地址</button><a class="wide" href="${links.amap}" target="_blank" rel="noopener">用高德地图去这里</a><a href="${links.baidu}" target="_blank" rel="noopener">百度地图</a><a href="${links.tencent}" target="_blank" rel="noopener">腾讯地图</a>${isIOS?`<a href="${links.apple}" target="_blank" rel="noopener">苹果地图</a>`:''}</div>`;
  $('#favoriteDetailBtn').addEventListener('click',()=>{ toggleFavorite(id); openDetail(id); });
  $('#copyAddressBtn').addEventListener('click',()=>copyText([r.name,r.address].filter(Boolean).join('，')));
  openDialog('detailDialog');
  if(state.map && hasCoords(r)){ state.map.setZoomAndCenter(16,[Number(r.longitude),Number(r.latitude)],false,400); }
  const shareUrl=new URL(location.href); shareUrl.searchParams.set('place',String(id)); history.replaceState(null,'',shareUrl);
}
function toggleFavorite(id){ state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id); saveFavorites(); renderAll(); toast(state.favorites.has(id)?'已收藏':'已取消收藏'); }
async function copyText(text){ try{ await navigator.clipboard.writeText(text); toast('已复制'); }catch{ window.prompt('长按复制：',text); } }

function populateFilters(){
  const fill=(id,values)=>{ const el=$(id); values.filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN')).forEach(v=>el.insertAdjacentHTML('beforeend',`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)); };
  fill('#categoryFilter',[...new Set(state.records.map(r=>r.category))]); fill('#districtFilter',[...new Set(state.records.map(r=>r.district))]); fill('#recommendFilter',[...new Set(state.records.map(r=>r.recommend))]);
}
function syncFilterDialog(){ $('#categoryFilter').value=state.category; $('#districtFilter').value=state.district; $('#recommendFilter').value=state.recommend; $('#priceFilter').value=state.price; $('#geoOnlyFilter').checked=state.geoOnly; }
function applyFilterDialog(){ state.category=$('#categoryFilter').value; state.district=$('#districtFilter').value; state.recommend=$('#recommendFilter').value; state.price=$('#priceFilter').value; state.geoOnly=$('#geoOnlyFilter').checked; closeDialog('filterDialog'); filterRecords(); }
function clearFilters(){ state.category=state.district=state.recommend=state.price=''; state.geoOnly=false; state.search=''; $('#searchInput').value=''; $('#clearSearchBtn').classList.add('hidden'); syncFilterDialog(); filterRecords(); }

function renderStats(){
  const average=state.records.filter(r=>r.price>0).reduce((s,r)=>s+r.price,0)/Math.max(1,state.records.filter(r=>r.price>0).length);
  const must=state.records.filter(r=>r.recommend==='必吃').length;
  const geos=state.records.filter(hasCoords).length;
  $('#statsCards').innerHTML=`<div class="stat-card"><strong>${state.records.length}</strong><span>餐厅记录</span></div><div class="stat-card"><strong>${new Set(state.records.map(r=>r.category)).size}</strong><span>分类/专栏</span></div><div class="stat-card"><strong>${must}</strong><span>必吃推荐</span></div><div class="stat-card"><strong>￥${Math.round(average)}</strong><span>参考平均人均</span></div><div class="stat-card"><strong>${geos}</strong><span>已有坐标</span></div><div class="stat-card"><strong>${state.favorites.size}</strong><span>我的收藏</span></div>`;
  renderBarStats('#categoryStats','category'); renderBarStats('#districtStats','district');
}
function renderBarStats(target,field){
  const counts=new Map(); state.records.forEach(r=>{ const k=r[field]||'未填写'; counts.set(k,(counts.get(k)||0)+1); });
  const rows=[...counts].sort((a,b)=>b[1]-a[1]); const max=rows[0]?.[1]||1;
  $(target).innerHTML=rows.map(([k,v])=>`<div class="bar-item"><span title="${escapeHtml(k)}">${escapeHtml(k)}</span><span class="bar-track"><i class="bar-fill" style="width:${v/max*100}%"></i></span><b>${v}</b></div>`).join('');
}

async function loadAmap(){
  const geoCount=state.records.filter(hasCoords).length;
  if(!CONFIG.amapJsKey || !CONFIG.amapSecurityJsCode){ showMapFallback('地图功能待配置',`当前已有 ${geoCount} 条坐标。填写高德 JS API Key 后即可显示地图。`); return; }
  try{
    window._AMapSecurityConfig={securityJsCode:CONFIG.amapSecurityJsCode};
    if(!window.AMapLoader){ await loadScript('https://webapi.amap.com/loader.js'); }
    const AMap=await window.AMapLoader.load({key:CONFIG.amapJsKey,version:'2.0',plugins:['AMap.Scale','AMap.ToolBar','AMap.Geolocation','AMap.MarkerCluster']});
    state.amap=AMap; state.map=new AMap.Map('map',{zoom:CONFIG.zoom||11,center:CONFIG.center||[114.305393,30.593099],viewMode:'2D',resizeEnable:true});
    state.map.addControl(new AMap.Scale()); state.map.addControl(new AMap.ToolBar({position:{top:'70px',right:'12px'}}));
    $('#mapFallback').classList.add('hidden'); renderMapMarkers();
    $('#mapStatus').textContent=geoCount?`已加载 ${geoCount} 个餐厅坐标`:'地图已启用，餐厅坐标仍待匹配'; setTimeout(()=>$('#mapStatus').textContent='',2500);
  }catch(e){ console.error(e); showMapFallback('地图加载失败','请检查高德 Key、安全密钥、域名白名单和网络。'); }
}
function loadScript(src){ return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }
function showMapFallback(title,text){ $('#mapFallbackTitle').textContent=title; $('#mapFallbackText').textContent=text; $('#mapFallback').classList.remove('hidden'); }
function clearMapMarkers(){
  if(state.markerCluster){ state.markerCluster.setMap(null); state.markerCluster=null; }
  if(state.map && state.markers.length) state.map.remove(state.markers);
  state.markers=[];
}
function renderMapMarkers(){
  if(!state.map || !state.amap) return; clearMapMarkers();
  const AMap=state.amap; const rows=state.filtered.filter(hasCoords);
  state.markers=rows.map(r=>{
    const dot=document.createElement('button'); dot.type='button'; dot.className='custom-map-marker'; dot.textContent=iconFor(r); dot.title=r.name;
    Object.assign(dot.style,{width:'34px',height:'34px',border:'2px solid white',borderRadius:'13px',background:r.recommend==='必吃'?'#f36f3d':'#2d7d66',color:'white',boxShadow:'0 5px 12px rgba(30,45,35,.28)',fontSize:'16px',display:'grid',placeItems:'center'});
    dot.addEventListener('click',()=>openDetail(r.id));
    return new AMap.Marker({position:[Number(r.longitude),Number(r.latitude)],content:dot,anchor:'bottom-center',extData:{id:r.id}});
  });
  if(state.markers.length){
    state.markerCluster=new AMap.MarkerCluster(state.map,state.markers,{gridSize:72,maxZoom:16,averageCenter:true});
  }
  if(state.markers.length && !state.initialFitDone){ state.map.setFitView(state.markers,false,[60,45,150,45],12); state.initialFitDone=true; }
}
function fitMap(){ if(!state.map){ toast('地图尚未启用'); return; } if(state.markers.length) state.map.setFitView(state.markers,false,[60,45,150,45],12); else state.map.setZoomAndCenter(CONFIG.zoom||11,CONFIG.center); }
async function locateUser(){
  $('#mapStatus').textContent='正在定位…';
  try{
    let pos;
    if(state.amap){
      pos=await new Promise((resolve,reject)=>{ const geo=new state.amap.Geolocation({enableHighAccuracy:true,timeout:10000,needAddress:true}); geo.getCurrentPosition((status,result)=>status==='complete'?resolve({lng:result.position.lng,lat:result.position.lat,source:'amap'}):reject(result)); });
    } else {
      pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({lng:p.coords.longitude,lat:p.coords.latitude,source:'browser'}),reject,{enableHighAccuracy:true,timeout:10000,maximumAge:60000}));
    }
    state.location=pos; sortRecords(); renderAll();
    if(state.map){ if(state.locationMarker) state.map.remove(state.locationMarker); const AMap=state.amap; state.locationMarker=new AMap.Marker({position:[pos.lng,pos.lat],content:'<div style="width:20px;height:20px;border:5px solid white;border-radius:50%;background:#1677ff;box-shadow:0 0 0 5px rgba(22,119,255,.22)"></div>',anchor:'center'}); state.map.add(state.locationMarker); state.map.setZoomAndCenter(14,[pos.lng,pos.lat]); }
    $('#mapStatus').textContent=pos.source==='amap'?'定位成功，已计算直线距离':'定位成功；地图未启用时距离可能有坐标偏差'; setTimeout(()=>$('#mapStatus').textContent='',3000); toast('定位成功');
  }catch(err){ console.error(err); $('#mapStatus').textContent='定位失败，请检查 HTTPS、系统定位和浏览器权限'; toast('定位失败，请检查权限'); }
}

function randomRestaurant(){ const pool=state.filtered.length?state.filtered:state.records; if(!pool.length)return; const r=pool[Math.floor(Math.random()*pool.length)]; openDetail(r.id); }
function shareApp(){
  const data={title:CONFIG.appName||'武汉美食地图',text:'一起看看朋友推荐的武汉美食地图',url:location.href};
  if(navigator.share) navigator.share(data).catch(()=>{}); else copyText(location.href);
}
function installHelp(){
  const ua=navigator.userAgent; const isWechat=/MicroMessenger/i.test(ua), isIOS=/iPad|iPhone|iPod/.test(ua);
  let html;
  if(isWechat) html='<p><strong>微信里需要先打开系统浏览器：</strong></p><p>点右上角“…” → 选择“在浏览器打开”。</p><p>然后按照浏览器菜单中的“添加到主屏幕”或“安装应用”操作。</p>';
  else if(isIOS) html='<p><strong>iPhone / iPad：</strong></p><p>请使用 Safari，点底部“分享”按钮 → “添加到主屏幕”。</p>';
  else html='<p><strong>安卓：</strong></p><p>使用 Chrome 或系统浏览器，打开浏览器菜单 → “安装应用”或“添加到主屏幕”。</p>';
  $('#installInstructions').innerHTML=html; openDialog('installDialog');
}

function bindEvents(){
  $('#searchInput').addEventListener('input',e=>{ state.search=e.target.value; $('#clearSearchBtn').classList.toggle('hidden',!state.search); clearTimeout(bindEvents.t); bindEvents.t=setTimeout(filterRecords,120); });
  $('#clearSearchBtn').addEventListener('click',()=>{ state.search=''; $('#searchInput').value=''; $('#clearSearchBtn').classList.add('hidden'); filterRecords(); });
  $('#filterBtn').addEventListener('click',()=>{ syncFilterDialog(); openDialog('filterDialog'); });
  $('#applyFiltersBtn').addEventListener('click',applyFilterDialog); $('#clearFiltersDialogBtn').addEventListener('click',clearFilters); $('#resetFiltersBtn').addEventListener('click',clearFilters);
  $('#sortSelect').addEventListener('change',e=>{ state.sort=e.target.value; sortRecords(); renderAll(); });
  $('#randomBtn').addEventListener('click',randomRestaurant); $('#locateBtn').addEventListener('click',locateUser); $('#fitMapBtn').addEventListener('click',fitMap);
  $('#shareBtn').addEventListener('click',shareApp); $('#openSetupBtn').addEventListener('click',()=>openDialog('setupDialog'));
  $('#clearFavoritesBtn').addEventListener('click',()=>{ if(state.favorites.size && confirm('清空当前设备上的全部收藏？')){ state.favorites.clear(); saveFavorites(); renderAll(); }});
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.closeDialog)));
  $$('.sheet-dialog').forEach(d=>d.addEventListener('click',e=>{ if(e.target===d) d.close(); }));
  $('#installBtn').addEventListener('click',async()=>{ if(state.deferredInstallPrompt){ state.deferredInstallPrompt.prompt(); await state.deferredInstallPrompt.userChoice; state.deferredInstallPrompt=null; $('#installBtn').classList.add('hidden'); }else installHelp(); });
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.deferredInstallPrompt=e; $('#installBtn').classList.remove('hidden'); });
  window.addEventListener('appinstalled',()=>toast('已安装到手机'));
}

async function init(){
  bindEvents();
  try{
    try {
      const res=await fetch(CONFIG.dataUrl||'./data/restaurants.json',{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
      state.records=await res.json();
    } catch (fetchError) {
      if(Array.isArray(window.EMBEDDED_RESTAURANTS)){ state.records=window.EMBEDDED_RESTAURANTS; toast('当前为本地预览模式'); }
      else throw fetchError;
    }
    state.filtered=[...state.records]; populateFilters(); sortRecords(); renderAll(); renderStats();
    const place=Number(new URLSearchParams(location.search).get('place')); if(place) setTimeout(()=>openDetail(place),100);
    await loadAmap();
  }catch(e){ console.error(e); $('#resultHint').textContent='数据加载失败'; showMapFallback('数据加载失败','请检查 data/restaurants.json 是否存在。'); }
  const swAllowed=location.protocol==='https:' || ['localhost','127.0.0.1'].includes(location.hostname);
  if('serviceWorker' in navigator && swAllowed) navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if(!isStandalone && (/iPad|iPhone|iPod|Android/.test(navigator.userAgent))) $('#installBtn').classList.remove('hidden');
}
init();
