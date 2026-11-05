const https = require('https');

const url = 'https://k-me-store-2.myshopify.com/cdn/shop/videos/c/vp/4bdf00c4fc954008904960bbb12bbe55/4bdf00c4fc954008904960bbb12bbe55.HD-1080p-7.2Mbps-84134145.mp4?v=0';

const req = https.request(url, { method: 'HEAD' }, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS: ', JSON.stringify(res.headers, null, 2));
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
