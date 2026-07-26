
const CONFIG = window.APP_CONFIG || {};
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

const state = {
  records: [], filtered: [], favorites: new Set(JSON.parse(localStorage.getItem('wfm:favorites') || '[]')),
  view: 'map', search: '', category: '', district: '', recommend: '', price: '', geoOnly: false, districts:[], businessAreas:[], categories:[], businessStatuses:[],
  sort: 'recommend', location: null, amap: null, map: null, markers: [], markerById: new Map(), locationMarker: null,
  deferredInstallPrompt: null, selectedId: null, initialFitDone: false, mapReady:false, route:null, routeRecord:null,
  notes: JSON.parse(localStorage.getItem('foodmap.restaurantNotes.v1') || '{}'), scrolls: {map:0,list:0,favorites:0}
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
function businessLabel(r){ return r.business_status==='open'?'营业中':r.business_status==='temporarily_closed'?'暂停营业':'状态待核实'; }
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
  state.filtered=state.records.filter(r=>window.FoodMapCore.matchesFilters(r,{search:q,category:state.category,district:state.district,recommend:state.recommend,price:state.price,geoOnly:state.geoOnly,districts:state.districts,businessAreas:state.businessAreas,categories:state.categories,businessStatuses:state.businessStatuses}));
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

function noteFor(id){ return String(state.notes[id]||''); }
function saveNotes(){ localStorage.setItem('foodmap.restaurantNotes.v1',JSON.stringify(state.notes)); }
function cardHtml(r){
  const dist=distanceFor(r);
  return `<button class="restaurant-card" type="button" data-id="${r.id}">
    <span class="food-icon">${iconFor(r)}</span>
    <span class="card-body"><span class="card-title-row"><strong>${escapeHtml(r.name)}</strong><span class="tag ${r.business_status==='temporarily_closed'?'closed':''}">${businessLabel(r)}</span>${r.recommend?`<span class="tag ${recClass(r.recommend)}">${escapeHtml(r.recommend)}</span>`:''}</span>
    <p>${escapeHtml([r.district,r.address].filter(Boolean).join(' · ') || '地点待补充')}</p><p>${escapeHtml(r.feature || r.cuisine || r.category)}</p>${state.view==='favorites'&&noteFor(r.id)?`<p class="note-summary">备注：${escapeHtml(noteFor(r.id))}</p>`:''}</span>
    <span class="card-side"><strong>${formatPrice(r)}</strong><span>${dist==null?(hasCoords(r)?'可定位后排序':'待匹配坐标'):formatDistance(dist)}</span></span>
  </button>`;
}
function renderList(target, records, onSelect=id=>openDetail(id)){
  const el=$(target); el.innerHTML=records.map(cardHtml).join('');
  $$('.restaurant-card',el).forEach(btn=>btn.addEventListener('click',()=>onSelect(Number(btn.dataset.id))));
}
function renderNearby(){
  let rows=state.filtered.filter(hasCoords);
  if(state.location) rows=[...rows].sort((a,b)=>distanceFor(a)-distanceFor(b));
  else rows=rows.slice(0,12);
  $('#nearbyRail').innerHTML=rows.slice(0,10).map(r=>`<button class="nearby-card ${state.selectedId===r.id?'selected':''}" type="button" data-id="${r.id}"><span class="row"><strong>${escapeHtml(r.name)}</strong><span>${formatPrice(r)}</span></span><p>${state.location?formatDistance(distanceFor(r)):escapeHtml(r.district||r.category)} · ${escapeHtml(r.feature||r.address||'查看详情')}</p></button>`).join('');
  $$('.nearby-card').forEach(btn=>bindMapCard(btn));
}
function selectRestaurant(id){ const r=state.records.find(row=>row.id===id); if(!r)return; if(state.selectedId===id){openDetail(id);return;} state.selectedId=id; if(hasCoords(r)){ selectMarker(id); state.map?.setZoomAndCenter(16,normalizedPosition(r)); }else toast('坐标待核实'); renderNearby(); }
function bindMapCard(button){ let start; button.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};}); button.addEventListener('click',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)return; selectRestaurant(Number(button.dataset.id));}); }
function updateSummary(){
  const favRows=state.filtered.filter(r=>state.favorites.has(r.id));
  $('#resultCount').textContent=`当前结果：${state.view==='favorites'?favRows.length:state.filtered.length} 家`;
  const active=[...state.districts,...state.businessAreas,...state.categories,...state.businessStatuses].length;
  $('#filterCount').textContent=active; $('#filterCount').classList.toggle('hidden',!active);
}
function renderAll(){
  updateSummary(); renderList('#restaurantList',state.filtered);
  $('#emptyState').classList.toggle('hidden',state.filtered.length>0);
  $('#restaurantList').classList.toggle('hidden',state.filtered.length===0);
  $('#resultHint').textContent=`显示 ${state.filtered.length} / ${state.records.length} 家${state.location?' · 已按当前位置计算距离':''}`;
  const favRows=state.records.filter(r=>state.favorites.has(r.id));
  const filteredFavRows=state.filtered.filter(r=>state.favorites.has(r.id));
  $('#favoritesView h2').textContent=`我的收藏 ${state.favorites.size}家`;
  renderList('#favoritesList',filteredFavRows); $('#favoritesList').classList.toggle('hidden',!filteredFavRows.length); $('#favoritesEmpty').classList.toggle('hidden',filteredFavRows.length>0);
  if(!filteredFavRows.length) $('#favoritesEmpty').querySelector('p').textContent=state.favorites.size?'当前搜索或筛选条件下没有收藏餐厅。':'打开餐厅详情，点一下“收藏”即可。';
  renderNearby(); renderMapMarkers();
}

function setView(view){
  const previous=state.view; state.scrolls[previous]=document.scrollingElement.scrollTop;
  state.view=view;
  ['map','list','favorites','stats'].forEach(v=>{
    $(`#${v}View`)?.classList.toggle('active',v===view);
    $(`.nav-btn[data-view="${v}"]`)?.classList.toggle('active',v===view);
  });
  updateSummary();
  requestAnimationFrame(()=>{ document.scrollingElement.scrollTop=state.scrolls[view]||0; if(view==='map' && state.map){ state.map.resize(); renderMapMarkers(); } });
  if(view==='stats') renderStats();
}

function detailNavigationLinks(r){ return window.FoodMapCore.navigationLinks(r,CONFIG); }
function openDetail(id){
  const r=state.records.find(x=>x.id===id); if(!r) return;
  state.selectedId=id; const dist=distanceFor(r), isFav=state.favorites.has(id);
  $('#detailContent').innerHTML=`<div class="detail-hero"><span class="food-icon">${iconFor(r)}</span><div><h2>${escapeHtml(r.name)}</h2><p>${escapeHtml([r.category,r.district,r.cuisine].filter(Boolean).join(' · '))}</p></div></div>
    <div class="detail-tags"><span class="tag ${r.business_status==='temporarily_closed'?'closed':''}">${businessLabel(r)}</span>${r.recommend?`<span class="tag ${recClass(r.recommend)}">${escapeHtml(r.recommend)}</span>`:''}${r.environment?`<span class="tag">环境：${escapeHtml(r.environment)}</span>`:''}${r.party?`<span class="tag">${escapeHtml(r.party)} 人</span>`:''}${r.needs_location_review||r.map_display_mode==='review'?`<span class="tag">坐标待核实 · ${escapeHtml(r.point_precision||'')}</span>`:'<span class="tag">精确点位</span>'}</div>
    <div class="detail-grid"><div class="detail-cell"><span>人均</span><strong>${formatPrice(r)}</strong></div><div class="detail-cell"><span>离我距离</span><strong>${formatDistance(dist)}</strong></div><div class="detail-cell"><span>地址</span><strong>${escapeHtml(r.address||'待补充')}</strong></div><div class="detail-cell"><span>包间</span><strong>${escapeHtml(r.privateRoom||'未记录')}</strong></div></div>
    ${r.feature?`<section class="detail-section"><h3>特色菜</h3><p>${escapeHtml(r.feature)}</p></section>`:''}
    ${r.reason?`<section class="detail-section"><h3>推荐理由</h3><p>${escapeHtml(r.reason)}</p></section>`:''}
    <div class="detail-actions detail-utilities"><button id="favoriteDetailBtn" type="button">${isFav?'★ 已收藏':'☆ 收藏'}</button><button id="copyAddressBtn" type="button">复制地址</button></div><label class="note-editor">我的备注（仅保存在当前设备）<textarea id="noteInput" maxlength="200" placeholder="写下这家店的提醒或偏好…">${escapeHtml(noteFor(r.id))}</textarea><span id="noteRemaining">${200-noteFor(r.id).length} 字可用</span><button id="saveNoteBtn" type="button">保存备注</button><button id="clearNoteBtn" type="button">清空备注</button></label><div class="detail-actions nav-actions"><button id="openMapChooserBtn" type="button" aria-label="打开地图软件">打开地图软件</button><button id="routeBtn" type="button" aria-label="站内导航">站内导航</button></div>`;
  $('#favoriteDetailBtn').addEventListener('click',()=>{ toggleFavorite(id); openDetail(id); });
  $('#copyAddressBtn').addEventListener('click',()=>copyText([r.name,r.address].filter(Boolean).join('，')));
  $('#openMapChooserBtn').addEventListener('click',()=>openMapChooser(r));
  $('#routeBtn').addEventListener('click',()=>startRoute(r));
  $('#noteInput').addEventListener('input',e=>$('#noteRemaining').textContent=`${200-e.target.value.length} 字可用`);
  $('#saveNoteBtn').addEventListener('click',()=>{const value=$('#noteInput').value.trim(); if(value)state.notes[r.id]=value;else delete state.notes[r.id];saveNotes();renderAll();toast('备注已保存');});
  $('#clearNoteBtn').addEventListener('click',()=>{delete state.notes[r.id];saveNotes();openDetail(r.id);toast('备注已清空');});
  openDialog('detailDialog');
  if(state.map && hasCoords(r)){ selectMarker(r.id); state.map.setZoomAndCenter(16,normalizedPosition(r),false,400); }
  const shareUrl=new URL(location.href); shareUrl.searchParams.set('place',String(id)); history.replaceState(null,'',shareUrl);
}
function openMapChooser(record){
  const links=detailNavigationLinks(record,CONFIG), options=[['高德地图',links.amap],['百度地图',links.baidu],['腾讯地图',links.tencent]];
  $('#mapChooserOptions').innerHTML=options.map(([name,href])=>`<a href="${href}" target="_blank" rel="noopener">${name}</a>`).join('');
  openDialog('mapChooserDialog');
}
function toggleFavorite(id){ state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id); saveFavorites(); renderAll(); toast(state.favorites.has(id)?'已收藏':'已取消收藏'); }
async function copyText(text){ try{ await navigator.clipboard.writeText(text); toast('已复制'); }catch{ window.prompt('长按复制：',text); } }

function populateFilters(){
  const fill=(id,values)=>{ const el=$(id); values.filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN')).forEach(v=>el.insertAdjacentHTML('beforeend',`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)); };
  fill('#districtFilter',[...new Set(state.records.map(r=>r.official_district))]); fill('#businessAreaFilter',[...new Set(state.records.flatMap(r=>r.business_area_tags_json||[]))]); fill('#categoryFilter',[...new Set(state.records.flatMap(r=>r.category_tags_json||[]))]);
  const status=$('#businessStatusFilter'); [['open','营业中'],['temporarily_closed','暂停营业'],['unknown','状态待核实']].forEach(([value,label])=>status.insertAdjacentHTML('beforeend',`<option value="${value}">${label}</option>`));
}
function selected(id){return [...$(id).selectedOptions].map(o=>o.value.includes('|')?o.value.split('|').pop():o.value)}
function syncFilterDialog(){ for(const [id,values] of [['#districtFilter',state.districts],['#businessAreaFilter',state.businessAreas],['#categoryFilter',state.categories],['#businessStatusFilter',state.businessStatuses]]){[...$(id).options].forEach(o=>o.selected=values.includes(o.value.includes('|')?o.value.split('|').pop():o.value));} }
function applyFilterDialog(){ state.districts=selected('#districtFilter'); state.businessAreas=selected('#businessAreaFilter'); state.categories=selected('#categoryFilter'); state.businessStatuses=selected('#businessStatusFilter'); closeDialog('filterDialog'); filterRecords(); }
function clearFilters(){ state.category=state.district=state.recommend=state.price=''; state.districts=[];state.businessAreas=[];state.categories=[];state.businessStatuses=[]; state.geoOnly=false; state.search=''; $('#searchInput').value=''; $('#clearSearchBtn').classList.add('hidden'); syncFilterDialog(); filterRecords(); }

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
  if(!CONFIG.amapJsKey || !CONFIG.amapSecurityJsCode){ showMapFallback('地图暂时不可用','地图配置缺失，请稍后重试。'); return; }
  try{
    window._AMapSecurityConfig={securityJsCode:CONFIG.amapSecurityJsCode};
    if(!window.AMapLoader){ await loadScript('https://webapi.amap.com/loader.js'); }
    const AMap=await window.AMapLoader.load({key:CONFIG.amapJsKey,version:'2.0',plugins:['AMap.Scale','AMap.ToolBar','AMap.Geolocation','AMap.Walking','AMap.Riding','AMap.Driving']});
    state.amap=AMap; state.map=new AMap.Map('map',{zoom:CONFIG.zoom||11,center:CONFIG.center||[114.305393,30.593099],viewMode:'2D',resizeEnable:true});
    state.map.addControl(new AMap.Scale()); state.map.addControl(new AMap.ToolBar({position:{top:'70px',right:'12px'}}));
    state.map.on('complete',()=>{ state.mapReady=true; $('#mapFallback').classList.add('hidden'); renderMapMarkers(); });
    $('#mapStatus').textContent=geoCount?`已加载 ${geoCount} 个餐厅坐标`:'地图已启用，餐厅坐标仍待匹配'; setTimeout(()=>$('#mapStatus').textContent='',2500);
  }catch(e){ console.error(e); showMapFallback('地图加载失败','请检查高德 Key、安全密钥、域名白名单和网络。'); }
}
function loadScript(src){ return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }
function showMapFallback(title,text){ $('#mapFallbackTitle').textContent=title; $('#mapFallbackText').textContent=text; $('#mapFallback').classList.remove('hidden'); }
function clearMapMarkers(){
  if(state.map && state.markers.length) state.map.remove(state.markers);
  state.markers=[]; state.markerById.clear();
}
function normalizedPosition(record){
  if(!hasCoords(record)) return null;
  const lng=Number(record.longitude),lat=Number(record.latitude);
  return Number.isFinite(lng)&&Number.isFinite(lat)&&lng!==0&&lat!==0?[lng,lat]:null;
}
function renderMapMarkers(){
  if(!state.map || !state.amap || !state.mapReady) return; clearMapMarkers();
  const AMap=state.amap; const rows=state.filtered.map(r=>({record:r,position:normalizedPosition(r)})).filter(row=>row.position);
  state.markers=rows.map(({record,position})=>{
    const marker=new AMap.Marker({position,zIndex:120,extData:{id:record.id}});
    if(record.business_status==='temporarily_closed'||record.map_display_mode==='temporarily_closed') marker.setLabel({content:'暂停营业',direction:'top'});
    else if(record.map_display_mode==='review'||record.needs_location_review) marker.setLabel({content:'坐标待核实',direction:'top'});
    marker.on('click',()=>openDetail(record.id)); state.markerById.set(record.id,marker); return marker;
  });
  if(state.markers.length) state.map.add(state.markers);
  window.__FOOD_MAP_DIAGNOSTICS={filtered:state.filtered.length,validCoordinates:rows.length,pointData:rows.length,directMarkers:state.markers.length,cluster:false};
  if(state.markers.length && !state.initialFitDone){ state.map.setFitView(state.markers,false,[60,45,150,45],12); state.initialFitDone=true; }
}
function selectMarker(id){ const marker=state.markerById.get(id); if(!marker)return; marker.setzIndex(300); marker.setAnimation?.('AMAP_ANIMATION_BOUNCE'); setTimeout(()=>marker.setAnimation?.('AMAP_ANIMATION_NONE'),1400); }
function fitMap(){ if(!state.map){ toast('地图尚未启用'); return; } if(state.markers.length) state.map.setFitView(state.markers,false,[60,45,150,45],12); else state.map.setZoomAndCenter(CONFIG.zoom||11,CONFIG.center); }
function clearRoute(){ if(state.route){ state.route.clear?.(); state.route=null; } state.routeRecord=null; $('#routePanel').classList.add('hidden'); $('#routePanel').innerHTML=''; renderMapMarkers(); if(state.selectedId)selectMarker(state.selectedId); }
async function startRoute(record,mode='walk'){
  if(!state.map || !normalizedPosition(record)){ toast('该餐厅暂无可用坐标，请使用地图软件导航'); return; }
  closeDialog('detailDialog'); setView('map');
  if(!state.location){ await locateUser(); }
  if(!state.location){ toast('定位失败，请使用地图软件导航'); return; }
  clearRoute(); clearMapMarkers(); const AMap=state.amap, target=normalizedPosition(record), Planner=mode==='drive'?AMap.Driving:mode==='ride'?AMap.Riding:AMap.Walking;
  if(!Planner){ toast('路线服务暂不可用，请使用地图软件导航'); return; }
  const panel=$('#routePanel'); panel.classList.remove('hidden'); panel.innerHTML=`<div><strong>站内路线：${escapeHtml(record.name)}</strong><span>正在规划${mode==='drive'?'驾车':mode==='ride'?'骑行（电瓶车参考）':'步行'}路线…</span></div><div class="route-actions"><button data-route-mode="walk">步行</button><button data-route-mode="ride">骑行</button><button data-route-mode="drive">驾车</button><button id="exitRouteBtn">退出路线</button></div>`;
  $$('#routePanel [data-route-mode]').forEach(button=>button.addEventListener('click',()=>startRoute(record,button.dataset.routeMode)));
  $('#exitRouteBtn').addEventListener('click',clearRoute);
  state.route=new Planner({map:state.map,autoFitView:true}); state.routeRecord=record;
  state.route.search([state.location.lng,state.location.lat],target,(status,result)=>{
    if(status!=='complete'){ panel.querySelector('span').textContent='路线规划失败，请使用地图软件导航'; return; }
    const route=result.routes?.[0]||result.route; const distance=route?.distance, duration=route?.time;
    panel.querySelector('span').textContent=distance?`约 ${(distance/1000).toFixed(distance<1000?0:1)} km · 约 ${Math.max(1,Math.round((duration||0)/60))} 分钟`:'路线已规划';
  });
}
function openMapList(){
  $('#mapListTitle').textContent=`当前结果 ${state.filtered.length} 家`; const list=$('#mapListContent'), empty=$('#mapListEmpty');
  renderList('#mapListContent',state.filtered,id=>{closeDialog('mapListDialog');selectRestaurant(id);}); empty.classList.toggle('hidden',state.filtered.length>0); list.classList.toggle('hidden',!state.filtered.length); openDialog('mapListDialog');
}
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
  const data={title:CONFIG.appName||'美食地图',text:'一起看看朋友推荐的美食地图',url:location.href};
  if(navigator.share) navigator.share(data).catch(()=>{}); else copyText(location.href);
}
function installHelp(){
  const ua=navigator.userAgent; const isWechat=/MicroMessenger/i.test(ua), isIOS=/iPad|iPhone|iPod/.test(ua);
  let html;
  if(isWechat) html='<p><strong>微信里需要先打开系统浏览器：</strong></p><p>点右上角“…” → 选择“在浏览器打开”。</p><p>然后按照浏览器菜单中的“添加到主屏幕”或“安装应用”操作。</p>';
  else if(isIOS) html='<p><strong>iPhone / iPad：</strong></p><p>请使用 Safari，点底部“分享”按钮 → “添加到主屏幕”。</p>';
  else html='<p><strong>安卓浏览器：</strong></p><p>打开浏览器菜单，选择“添加到桌面 / 添加到主屏幕 / 安装应用 / 添加快捷方式”。</p>';
  $('#installInstructions').innerHTML=html; openDialog('installDialog');
}

function bindEvents(){
  $('#searchInput').addEventListener('input',e=>{ state.search=e.target.value; $('#clearSearchBtn').classList.toggle('hidden',!state.search); clearTimeout(bindEvents.t); bindEvents.t=setTimeout(filterRecords,120); });
  $('#clearSearchBtn').addEventListener('click',()=>{ state.search=''; $('#searchInput').value=''; $('#clearSearchBtn').classList.add('hidden'); filterRecords(); });
  $('#filterBtn').addEventListener('click',()=>{ syncFilterDialog(); openDialog('filterDialog'); });
  $('#applyFiltersBtn').addEventListener('click',applyFilterDialog); $('#clearFiltersDialogBtn').addEventListener('click',clearFilters); $('#resetFiltersBtn').addEventListener('click',clearFilters);
  $('#sortSelect').addEventListener('change',e=>{ state.sort=e.target.value; sortRecords(); renderAll(); });
  $('#randomBtn').addEventListener('click',randomRestaurant); $('#locateBtn').addEventListener('click',locateUser); $('#fitMapBtn').addEventListener('click',fitMap);
  $('#openMapListBtn').addEventListener('click',openMapList); $('#mapListResetBtn').addEventListener('click',()=>{clearFilters();openMapList();});
  $('#shareBtn').addEventListener('click',shareApp);
  $('#clearFavoritesBtn').addEventListener('click',()=>{ if(state.favorites.size && confirm('清空当前设备上的全部收藏？')){ state.favorites.clear(); saveFavorites(); renderAll(); }});
  $('#cancelMapChooserBtn').addEventListener('click',()=>closeDialog('mapChooserDialog'));
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
  if(isStandalone) $('#installBtn').classList.add('hidden');
  else if(/MicroMessenger|iPad|iPhone|iPod/i.test(navigator.userAgent)) $('#installBtn').classList.remove('hidden');
}
init();
