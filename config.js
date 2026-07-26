// 本文件可直接修改。不要把高德 Web 服务 Key 写在这里；Web 服务 Key 仅用于本地坐标匹配脚本。
window.APP_CONFIG = Object.assign({
  appName: "武汉美食地图",
  cityName: "武汉",
  cityAdcode: "420100",
  center: [114.305393, 30.593099],
  zoom: 11,
  dataUrl: "./data/restaurants.json",

  // 高德开放平台 → Web端（JS API）Key
  amapJsKey: "",
  // 与上述 JS API Key 配套的安全密钥 securityJsCode
  amapSecurityJsCode: "",

  // 用于高德 URI 的来源标识，可保持默认
  uriSource: "wuhan-food-map",
  defaultTravelMode: "walk"
}, window.RUNTIME_CONFIG || {});
