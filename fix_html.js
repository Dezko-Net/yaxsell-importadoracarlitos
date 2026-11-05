const fs = require('fs');

const files = [
    'c:/Proyectos/PROJECT YAXSEL/web-store/public/shopify/plantilla8/body-clean.html',
    'c:/Proyectos/PROJECT YAXSEL/web-store/public/shopify/plantilla8/index.html'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf-8');

    // Fix block 1
    const badBlock1Regex = /<div class="multimedia-collage__background w-full h-full absolute top-0 left-0">([\s\S]*?)<div class="premium-badge"[\s\S]*?YES BELLA<\/span>\s*<\/div>\s*<\/div>/g;
    
    // Check if it's there
    let replaced1 = false;
    content = content.replace(badBlock1Regex, (match) => {
        replaced1 = true;
        return `<div class="multimedia-collage__background w-full h-full absolute top-0 left-0">
            <premium-video class="w-full h-full block relative z-10 overflow-hidden">
                <div class="premium-video-inner w-full h-full relative block transition-transform duration-500 ease-out transform-gpu" style="transform-style: preserve-3d;">
                    <video class="object-cover w-full h-full absolute top-0 left-0" autoplay muted playsinline preload="auto" style="height: 100%; width: 100%; object-fit: cover;">
                        <source src="https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/KEVINCOCO%2Flv_0_20260528020713.mp4?alt=media&token=95eed622-375c-4f99-a067-658a960d457b" type="video/mp4">
                    </video>
                    <div class="premium-video-overlay" style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, transparent 70%); opacity: 0.7; pointer-events: none; z-index: 12; transition: opacity 0.6s ease;"></div>
                    <div class="premium-vignette" style="position: absolute; inset: 0; background: radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.3) 100%); opacity: 0.6; pointer-events: none; z-index: 13;"></div>
                    <div class="premium-inner-border" style="position: absolute; inset: 20px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: calc(var(--item-border-radius, 50px) - 20px); opacity: 0; transform: scale(0.97); transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none; z-index: 14;"></div>
                    <div class="premium-badge" style="position: absolute; top: 24px; left: 24px; background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.2); padding: 8px 16px; border-radius: 100px; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 8px; opacity: 1; pointer-events: none; z-index: 15;">
                        <span class="premium-badge-dot" style="width: 6px; height: 6px; border-radius: 50%; background-color: #10b981; animation: pulse-emerald 2s infinite;"></span>
                        <span>YES BELLA</span>
                    </div>
                </div>
            </premium-video>
        </div>`;
    });

    // Fix block 2 (inside morph-svg-inner)
    const badBlock2Regex = /<div class="morph-svg-inner">\s*<video[\s\S]*?<\/video>\s*<div class="premium-video-overlay"><\/div>\s*<div class="premium-vignette"><\/div>\s*<div class="premium-inner-border"><\/div>\s*<div class="premium-badge">\s*<span class="premium-badge-dot"><\/span>\s*<span>YES BELLA<\/span>\s*<\/div>/g;

    let replaced2 = false;
    content = content.replace(badBlock2Regex, (match) => {
        replaced2 = true;
        return `<div class="morph-svg-inner">
            <premium-video class="w-full h-full block relative z-10 overflow-hidden">
                <div class="premium-video-inner w-full h-full relative block transition-transform duration-500 ease-out transform-gpu" style="transform-style: preserve-3d;">
                    <video class="object-cover w-full h-full absolute top-0 left-0" autoplay muted playsinline preload="auto" style="height: 100%; width: 100%; object-fit: cover;">
                        <source src="https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/KEVINCOCO%2Flv_0_20260528020713.mp4?alt=media&token=95eed622-375c-4f99-a067-658a960d457b" type="video/mp4">
                    </video>
                    <div class="premium-video-overlay"></div>
                    <div class="premium-vignette"></div>
                    <div class="premium-inner-border"></div>
                    <div class="premium-badge">
                        <span class="premium-badge-dot"></span>
                        <span>YES BELLA</span>
                    </div>
                </div>
            </premium-video>`;
    });

    // Fix hovering CSS for premium-video
    if (!content.includes('premium-video:hover .premium-inner-border')) {
        content = content.replace('.morph-svg-collage-wrapper:hover .premium-inner-border', 'premium-video:hover .premium-inner-border, .morph-svg-collage-wrapper:hover .premium-inner-border');
        content = content.replace('.morph-svg-collage-wrapper:hover .premium-video-overlay', 'premium-video:hover .premium-video-overlay, .morph-svg-collage-wrapper:hover .premium-video-overlay');
        content = content.replace('.morph-svg-collage-wrapper:hover .premium-badge', 'premium-video:hover .premium-badge, .morph-svg-collage-wrapper:hover .premium-badge');
    }

    fs.writeFileSync(file, content);
    console.log(`Updated ${file} (Block1: ${replaced1}, Block2: ${replaced2})`);
}
