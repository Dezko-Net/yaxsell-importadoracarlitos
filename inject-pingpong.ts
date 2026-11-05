import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. We already removed controls and added onclick="...". Let's verify.
let replaceCount = 0;
html = html.replace(/<video[^>]*>[\s\S]*?<source[^>]*lv_0_20260528021828\.mp4[^>]*>[\s\S]*?<\/video>/g, (match) => {
    replaceCount++;
    let cleaned = match.replace(/controls="controls"/g, '');
    if (!cleaned.includes('onclick=')) {
        cleaned = cleaned.replace('<video ', '<video onclick="this.paused ? this.play() : this.pause()" id="pingpong-video" ');
    }
    cleaned = cleaned.replace(/loop="loop"/g, '');
    return cleaned;
});

// Remove any existing pingpong scripts if they got injected somehow
html = html.replace(/<script id="pingpong-script">[\s\S]*?<\/script>/g, '');

const newScript = `
<script id="pingpong-script">
document.addEventListener("DOMContentLoaded", function() {
    // wait a bit for the video to be injected if it's a web component
    setTimeout(function() {
        var vid = document.getElementById("pingpong-video") || document.querySelector('video[src*="lv_0_20260528021828"]');
        if (!vid) {
            // Check inside block-video just in case
            var block = document.querySelector('block-video');
            if (block) vid = block.querySelector('video');
        }
        
        if (vid) {
            var isReversing = false;
            var maxTime = 5.0; // The video will only play up to 5 seconds
            
            // Detect iPhone/iPad/iPod
            var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            
            // Make sure it has the id so onclick works
            vid.id = "pingpong-video";
            vid.removeAttribute("controls");
            vid.removeAttribute("loop");
            vid.onclick = function() {
                this.paused ? this.play() : this.pause();
            };
            
            vid.addEventListener('timeupdate', function() {
                // If it's iOS, just pause when it reaches 5s
                if (isIOS) {
                    if (vid.currentTime >= maxTime) {
                        vid.pause();
                        vid.currentTime = maxTime;
                    }
                    return;
                }
                
                // For other devices: Ping-Pong
                // If we are playing forward and hit 5s
                if (!isReversing && vid.currentTime >= maxTime) {
                    isReversing = true;
                    vid.pause();
                    try { vid.playbackRate = -1; } catch(e) {}
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
            
            vid.addEventListener('ended', function() {
                if (isIOS) return;
                if (!isReversing) {
                    isReversing = true;
                    try { vid.playbackRate = -1; } catch(e) {}
                    vid.play();
                }
            });
        }
    }, 1000);
});
</script>
`;

// Append script to end of file
html += '\\n' + newScript;

fs.writeFileSync(htmlPath, html);
console.log("Successfully injected the new ping-pong script with iOS 5s pause logic.");
