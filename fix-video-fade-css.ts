import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Remove the mask from the Picsart image (the background)
const picsartMaskStyle = ` style="transform: scale(0.95); -webkit-mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);"`;
html = html.replace(new RegExp(picsartMaskStyle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');


// 2. Add the mask to the floating video (lv_0_20260528021828.mp4)
// Instead of messing with inline styles on a template which might be stripped, 
// let's inject a CSS rule right before the <block-video> that contains this specific video.
// The <block-video> is inside a <div id="shopify-block-ASXkxK2NZTGRQYTlxd__video_9wHDat">...
// Let's just find the <block-video ... data-video-type="shopify"> ... lv_0_20260528021828.mp4 ... </block-video>
// and prepend a <style> block.

// We know the target URL:
const targetUrl = "lv_0_20260528021828.mp4";

let replaceCount = 0;
// We find the specific <block-video> by matching from <block-video to </block-video>
html = html.replace(/<block-video\b[\s\S]*?<\/block-video>/g, (match) => {
    if (match.includes(targetUrl)) {
        replaceCount++;
        // Create a style block. We'll target the video tag inside this block-video.
        // We can just add a unique class to the block-video to target it.
        const uniqueClass = "video-faded-corners";
        const css = `
<style>
.video-faded-corners {
    transform: scale(0.9);
    border-radius: 30px; /* Removes sharp corners (puntas) */
    -webkit-mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);
    mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);
    overflow: hidden;
}
.video-faded-corners video, .video-faded-corners iframe {
    -webkit-mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);
    mask-image: radial-gradient(ellipse at center, black 65%, transparent 100%);
    border-radius: 30px;
}
</style>
`;
        
        let newMatch = match.replace('<block-video ', `<block-video class="${uniqueClass} " `);
        
        return css + newMatch;
    }
    return match;
});

// Since earlier I might have added the class multiple times if ran multiple times, let's clean it up
// But this is a fresh run since we're just adding it now.

fs.writeFileSync(htmlPath, html);
console.log(`Successfully fixed fade on ${replaceCount} video block and removed from background.`);
