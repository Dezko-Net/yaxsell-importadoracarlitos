const https = require('https');

const url = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/06/1781382997424-pegada-1781382994712.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=HLc2fc52tRTasJ7W8b6kNqzVw9j769Q9tosx4WhCx3r5tpOGpBSp%2BI6%2BiW1Iqh8iow5EqyXs6xyCyTo25PESb2VGRFZpEewDoDQ1sU5gWUlBz4YfuCNo958uvlt9U5MSeaMncwa0TCZ6KDf0lgdzXm0R7MDR9QjJXuQuLOlokLpifc9sUj8PVKxeWecbqJtzUFd0o7mYMPfOQmaSfXhO27Frz0ksQV9vW6scFPmMqgHyuLrVe6o7gdefaDWbDOtVI%2FKRKlLsOnJqrjIEmtch5%2B7VANK2KnOGC1qXY7RAI86wdxFQSYzNXhgW5%2FMUfje993OuIJC67HiDAWD5VAE44A%3D%3D";

https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Content-Length:', res.headers['content-length']);
}).on('error', (e) => {
  console.error(e);
});
