const fs = require('fs');

const path = 'public/shopify/plantilla13/body-clean.html';
let content = fs.readFileSync(path, 'utf8');

// The slideshow video ID: aabc15baa4984915ad6486ee139b15ce, source: aabc15baa4984915ad6486ee139b15ce.HD-1080p-7.2Mbps-83967798.mp4
// The original split video ID: 4bdf00c4fc954008904960bbb12bbe55, source: 4bdf00c4fc954008904960bbb12bbe55.HD-1080p-7.2Mbps-84134145.mp4

const oldVideoId = '4bdf00c4fc954008904960bbb12bbe55';
const newVideoId = 'aabc15baa4984915ad6486ee139b15ce';

const oldVideoFile = '4bdf00c4fc954008904960bbb12bbe55.HD-1080p-7.2Mbps-84134145.mp4';
const newVideoFile = 'aabc15baa4984915ad6486ee139b15ce.HD-1080p-7.2Mbps-83967798.mp4';

const oldPoster = 'files/preview_images/4bdf00c4fc954008904960bbb12bbe55.thumbnail.0000000000.jpg';
const newPoster = 'files/preview_images/aabc15baa4984915ad6486ee139b15ce.thumbnail.0000000000.jpg';

const oldFallback = '4bdf00c4fc954008904960bbb12bbe55.thumbnail.0000000000_100x.jpg?v=1778781991';
const newFallback = 'aabc15baa4984915ad6486ee139b15ce.thumbnail.0000000000_100x.jpg?v=1778617843';

let count = 0;
// Replace in content
content = content.split(oldVideoFile).join(newVideoFile);
content = content.split(oldVideoId).join(newVideoId);
content = content.split(oldPoster).join(newPoster);
content = content.split(oldFallback).join(newFallback);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully swapped the split-hero video with the working slideshow herobanner video!');
