(function (global) {
  const WUHAN_BOUNDS = { minLng: 113.6, maxLng: 115.1, minLat: 29.8, maxLat: 31.4 };
  const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

  function isReliableCoordinate(record) {
    const status = record.geocode_status || record.geocodeStatus || '';
    const lng = record.longitude, lat = record.latitude;
    return (record.is_mappable === true || status === 'confirmed') && finite(lng) && finite(lat) &&
      Number(lng) >= WUHAN_BOUNDS.minLng && Number(lng) <= WUHAN_BOUNDS.maxLng &&
      Number(lat) >= WUHAN_BOUNDS.minLat && Number(lat) <= WUHAN_BOUNDS.maxLat;
  }

  function haversine(from, to) {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(to.lat - from.lat), dLng = rad(to.lng - from.lng);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(q));
  }

  function formatDistance(meters) {
    if (meters === null || meters === undefined || !Number.isFinite(meters)) return '距离未知';
    if (meters < 1000) return `约 ${Math.max(10, Math.round(meters / 10) * 10)} m`;
    return `约 ${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  }

  function matchesFilters(record, filters) {
    const query = (filters.search || '').trim().toLowerCase();
    const text = [record.name, record.address, record.category, record.district, record.feature, record.reason, record.cuisine].join(' ').toLowerCase();
    const range = filters.price ? filters.price.split('-').map(Number) : null;
    const any=(selected,values)=>!selected?.length||selected.some(x=>values.includes(x));
    const recommendation = filters.effectiveRecommendation ? filters.effectiveRecommendation(record) : (record.recommendation || record.recommend || '');
    return (!query || text.includes(query)) &&
      (!filters.category || record.category === filters.category) &&
      (!filters.district || record.district === filters.district) &&
      any(filters.districts,[record.official_district||record.district]) &&
      any(filters.businessAreas,record.business_area_tags_json||[]) &&
      any(filters.categories,record.category_tags_json||[]) &&
      any(filters.businessStatuses,[record.business_status||'unknown']) &&
      any(filters.recommendations,[recommendation]) &&
      (!filters.recommend || recommendation === filters.recommend) &&
      (!range || (Number(record.price) >= range[0] && Number(record.price) < range[1])) &&
      (!filters.geoOnly || isReliableCoordinate(record));
  }

  function navigationLinks(record, config) {
    const name = encodeURIComponent(record.name || '');
    const query = encodeURIComponent(record.query || `${config.cityName || '武汉'} ${record.name || ''} ${record.address || ''}`.trim());
    const src = encodeURIComponent(config.uriSource || 'wuhan-food-map');
    if (isReliableCoordinate(record)) {
      const lng = Number(record.longitude).toFixed(6), lat = Number(record.latitude).toFixed(6);
      return {
        amap: `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=${encodeURIComponent(config.defaultTravelMode || 'walk')}&src=${src}&coordinate=gaode&callnative=1`,
        baidu: `https://map.baidu.com/search/${query}`,
        tencent: `https://apis.map.qq.com/uri/v1/search?keyword=${query}&region=${encodeURIComponent(config.cityName || '武汉')}`,
        apple: `https://maps.apple.com/?daddr=${lat},${lng}&q=${name}`
      };
    }
    return {
      amap: `https://uri.amap.com/search?keyword=${query}&city=${encodeURIComponent(config.cityName || '武汉')}&view=map&src=${src}&callnative=1`,
      baidu: `https://map.baidu.com/search/${query}`,
      tencent: `https://apis.map.qq.com/uri/v1/search?keyword=${query}&region=${encodeURIComponent(config.cityName || '武汉')}`,
      apple: `https://maps.apple.com/?q=${query}`
    };
  }

  global.FoodMapCore = { WUHAN_BOUNDS, isReliableCoordinate, haversine, formatDistance, matchesFilters, navigationLinks };
})(window);
