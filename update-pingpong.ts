import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Find the old script and replace it.
const oldScriptRegex = /<script>\s*document\.addEventListener\("DOMContentLoaded", function\(\) \{\s*var vid = document\.getElementById\("pingpong-video"\);[\s\S]*?<\/script>/;

const newScript = `
<script>
document.addEventListener("DOMContentLoaded", function() {
    var vid = document.getElementById("pingpong-video");
    if (vid) {
        var isReversing = false;
        var maxTime = 5.0; // The video will only play up to 5 seconds
        
        // Detect iPhone/iPad/iPod
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        vid.addEventListener('timeupdate', function() {
            // If it's iOS, just pause when it reaches 5s
            if (isIOS) {
                if (vid.currentTime >= maxTime) {
                    vid.pause();
                    // Optional: keep it at maxTime
                    vid.currentTime = maxTime;
                }
                return;
            }
            
            // For other devices: Ping-Pong
            // If we are playing forward and hit 5s
            if (!isReversing && vid.currentTime >= maxTime) {
                isReversing = true;
                vid.pause();
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
        
        // Just in case it somehow reaches the actual end of the file
        vid.addEventListener('ended', function() {
            if (isIOS) return;
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

if (html.match(oldScriptRegex)) {
    html = html.replace(oldScriptRegex, newScript.trim());
    fs.writeFileSync(htmlPath, html);
    console.log("Successfully updated the ping-pong script.");
} else {
    console.log("Could not find the old script to replace.");
}
