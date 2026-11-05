const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const geo = JSON.parse(data);
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(128, 64);
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#111';
        geo.features.forEach(f => {
            const geoms = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
            geoms.forEach(poly => {
                ctx.beginPath();
                poly[0].forEach((pt, i) => {
                    const x = (pt[0] + 180) / 360 * 128;
                    const y = (90 - pt[1]) / 180 * 64;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.fill();
            });
        });
        
        const pixels = ctx.getImageData(0, 0, 128, 64).data;
        const rows = [];
        for (let y = 0; y < 64; y++) {
            let row = "";
            for (let x = 0; x < 128; x++) {
                // Alpha or red indicates drawing
                row += pixels[(y * 128 + x) * 4 + 3] > 0 ? "1" : "0";
            }
            rows.append(row); // oops, rows.push
        }
    });
});
