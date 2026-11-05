const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://raw.githubusercontent.com/fcortes/Chile-GeoJSON/master/comunas.geojson';

console.log('Downloading and filtering RM comunas...');
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const geo = JSON.parse(data);
      const rmFeatures = geo.features.filter(f => 
        f.properties && 
        (f.properties.Region === 'Región Metropolitana de Santiago' || 
         f.properties.codregion === 13)
      );

      console.log('Found', rmFeatures.length, 'comunas in Región Metropolitana');

      // Let's find bounds
      let minLng = Infinity, maxLng = -Infinity;
      let minLat = Infinity, maxLat = -Infinity;

      // Extract coords to find bounds
      rmFeatures.forEach(f => {
        const type = f.geometry.type;
        const coords = type === 'Polygon' ? [f.geometry.coordinates] : (type === 'MultiPolygon' ? f.geometry.coordinates : []);
        
        coords.forEach(poly => {
          poly[0].forEach(pt => {
            const lng = pt[0];
            const lat = pt[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          });
        });
      });

      console.log('Bounds: Lng', minLng, 'to', maxLng, '| Lat', minLat, 'to', maxLat);

      const W = 400;
      const H = 400;

      const midLng = (minLng + maxLng) / 2;
      const midLat = (minLat + maxLat) / 2;
      const radLat = (midLat * Math.PI) / 180;
      const cosLat = Math.cos(radLat);

      // Width and height in degrees (adjusted by cosLat for width)
      const dLng = maxLng - minLng;
      const dLat = maxLat - minLat;
      const widthDeg = dLng * cosLat;
      const heightDeg = dLat;

      // Find scale to fit in W x H
      const padding = 20;
      const scaleX = (W - padding * 2) / widthDeg;
      const scaleY = (H - padding * 2) / heightDeg;
      const scale = Math.min(scaleX, scaleY);

      console.log('Using projection scale:', scale);

      const tx = (lng) => {
        return W / 2 + (lng - midLng) * scale * cosLat;
      };

      const ty = (lat) => {
        return H / 2 - (lat - midLat) * scale;
      };

      // Now map each feature to a simplified object
      const processedComunas = rmFeatures.map(f => {
        const name = f.properties.Comuna || f.properties.comuna;
        const provincia = f.properties.Provincia || f.properties.provincia;
        const codComuna = f.properties.cod_comuna || f.properties.cod_comunas;
        
        const type = f.geometry.type;
        const coords = type === 'Polygon' ? [f.geometry.coordinates] : (type === 'MultiPolygon' ? f.geometry.coordinates : []);
        
        const paths = [];
        let centerSumX = 0;
        let centerSumY = 0;
        let centerCount = 0;

        coords.forEach(poly => {
          // poly[0] is the outer boundary, poly[1...] are holes if any
          const pts = poly[0];
          if (pts.length < 3) return;

          let pathStr = '';
          pts.forEach((pt, idx) => {
            const px = Number(tx(pt[0]).toFixed(1));
            const py = Number(ty(pt[1]).toFixed(1));
            centerSumX += px;
            centerSumY += py;
            centerCount++;

            if (idx === 0) {
              pathStr += `M${px},${py}`;
            } else {
              pathStr += `L${px},${py}`;
            }
          });
          pathStr += 'Z';
          paths.push(pathStr);
        });

        // Compute local label anchor
        const lx = centerCount > 0 ? Number((centerSumX / centerCount).toFixed(1)) : W / 2;
        const ly = centerCount > 0 ? Number((centerSumY / centerCount).toFixed(1)) : H / 2;

        return {
          key: name,
          provincia,
          code: codComuna,
          lx,
          ly,
          paths
        };
      });

      // Sort alphabetically
      processedComunas.sort((a, b) => a.key.localeCompare(b.key));

      const outPath = path.join(__dirname, 'src/app/admin/(panel)/dashboard/santiago_comunas.json');
      fs.writeFileSync(outPath, JSON.stringify(processedComunas, null, 2), 'utf8');
      console.log('Saved', processedComunas.length, 'comunas to', outPath);

    } catch (e) {
      console.error('Error processing:', e);
    }
  });
}).on('error', (err) => {
  console.error('Download error:', err);
});
