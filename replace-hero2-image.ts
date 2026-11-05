import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const newImageUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/IADESIGN/2026/05/1780036106736-pegada-1780036104331.png?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=YawZy2K7pnPTLU3iIhZE6ekLPN9TtnPJfQLoLlCEfOYyj9YqlgA49ZR1SCOIJagttZta95JwDIW7O26lAzva4wt6wFqgW%2FVIXC1wg9Vsn6SZHWHEDwIYwlSPdZa%2BKKWe3%2FcqKf2Z0ItR%2BwBurIkAcL9ZAmTTi1a9VjYrx9qzPFcsBfmQ7AeE6LwQxci0ltEqI%2Bats5Gd8L8ouy46QNOjIzWBOOx4VSczugjcfwLNcYeO71HTFRgenNdYCkkKUIqFNR%2BYwCa3%2BsRuZyheh9jJfzHHVKp9iqBHyx9YU7OpBOnc3iRA7ANOwjXGead9JnUe6WZmL15sgzkSEaS5iEli8w%3D%3D";

// We need to replace the Picsart image URLs with the new one.
// The Picsart image URL starts with: https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/KEVINCOCO%2FPicsart_26-05-29_00-36-01-936.jpg.jpeg
// Because it might be encoded, we will just use regex to match "https://firebasestorage.googleapis.com[^"]+Picsart[^"]+"
html = html.replace(/https:\/\/firebasestorage\.googleapis\.com[^"]+Picsart[^"]+/g, newImageUrl);

fs.writeFileSync(htmlPath, html);
console.log("Successfully replaced the background image for Herobanner 2.");
