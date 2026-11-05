import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const targetUrl = "lv_0_20260528021828.mp4";

// 1. Remove controls="controls" and add onclick and id for the ping-pong script
html = html.replace(/<video([^>]*lv_0_20260528021828\.mp4[^>]*)>/g, (match, p1) => {
    // We already wrapped it in block-video so we need to be careful to match the actual video tag inside block-video.
    return match; // Not matching properly this way because the targetUrl is in the source tag.
});

let replaceCount = 0;
// Find the video tag containing the source
html = html.replace(/<video[^>]*>[\s\S]*?<source[^>]*lv_0_20260528021828\.mp4[^>]*>[\s\S]*?<\/video>/g, (match) => {
    replaceCount++;
    // Remove controls="controls"
    let cleaned = match.replace(/controls="controls"/g, '');
    
    // Add onclick
    if (!cleaned.includes('onclick=')) {
        cleaned = cleaned.replace('<video ', '<video onclick="this.paused ? this.play() : this.pause()" id="pingpong-video" ');
    }
    
    // Remove loop="loop" so we can handle pingpong
    cleaned = cleaned.replace(/loop="loop"/g, '');
    
    return cleaned;
});

// 2. Add the Ping Pong JavaScript
const pingPongScript = `
<script>
document.addEventListener("DOMContentLoaded", function() {
    var vid = document.getElementById("pingpong-video");
    if (vid) {
        var isReversing = false;
        
        vid.addEventListener('timeupdate', function() {
            // If we are playing forward and hit the end
            if (!isReversing && vid.currentTime >= vid.duration - 0.1) {
                isReversing = true;
                vid.pause();
                // PlaybackRate -1 is choppy on many devices but we try it
                vid.playbackRate = -1; 
                vid.play();
            }
            // If we are playing backward and hit the start
            else if (isReversing && vid.currentTime <= 0.1) {
                isReversing = false;
                vid.pause();
                vid.playbackRate = 1;
                vid.play();
            }
        });
        
        // Fallback for ended event just in case
        vid.addEventListener('ended', function() {
            if (!isReversing) {
                isReversing = true;
                vid.playbackRate = -1;
                vid.play();
            }
        });
    }
});
</script>
`;

if (replaceCount > 0 && !html.includes('pingpong-video')) {
     html = html.replace('</body>', pingPongScript + '\n</body>');
}

fs.writeFileSync(htmlPath, html);
console.log("Removed controls and added ping pong script.");
