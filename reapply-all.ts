import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'public', 'shopify', 'plantilla23', 'body-clean.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Logo pure white (add filter: brightness(0) invert(1) !important; to the logo image)
// Look for class="logo py-1"
html = html.replace(/(<img[^>]+class="logo py-1"[^>]+style=")([^"]*)(")/g, (match, p1, p2, p3) => {
    // If it already has filter, don't add it again, otherwise add it
    if (!p2.includes('brightness(0)')) {
        return `${p1}${p2} filter: brightness(0) invert(1) !important;${p3}`;
    }
    return match;
});

// Also just in case the style attribute isn't there, let's just do a blanket replace:
html = html.replace(/class="logo py-1"/g, 'class="logo py-1" style="width: 300px !important; max-width: 300px !important; height: 150px !important; max-height: 150px !important; object-fit: contain !important; filter: brightness(0) invert(1) !important;"');


// 2. Video replacement and blur frame
const targetVideoStr = "d94f51416ef54d89945c16c93ad5c2f8";
const newVideoUrl = "https://storage.googleapis.com/geminai-449212.firebasestorage.app/KEVINCOCO/lv_0_20260528021828.mp4?GoogleAccessId=imagen%40geminai-449212.iam.gserviceaccount.com&Expires=16730334000&Signature=XnzPun4XsvU%2FecUFxQVW7TeibNPcx1x%2FduFqIUpM6swrQbMVxKhX8vX96JU%2BQvmL1nQ4RizKYnHhIwmm2zTQttKBxtHLhDekxoGGlsXbPGyrzwnSCf1bedEwonk7axwz4suJAHiJDdWUaAlksSefnz3SJYD1%2BJhijTPHqX2FTmIc718dMIi5spU8WuuL0B41UNEtNIGWUzEjQx4f4uS0RogRRLZdkJKLafDLr41lnOi6pEeJwNF7jwnyjR4OolJmVANFE7yAmzMsGkdHqlUmuIG7ojP6DNVz2ycYhyGo83ef%2B9DK6xrQAjUc%2BhbQ35HrDCWpNt4NCTwAovXv8O50FA%3D%3D";

// We need to replace the src of the source tag inside the video containing d94f
const videoRegex = new RegExp(`(<video [^>]*>[^<]*<source src="[^"]*${targetVideoStr}[^"]*"[^>]*>)`, 'g');
html = html.replace(videoRegex, (match) => {
    // Replace the src
    let replacedSrc = match.replace(/src="[^"]*"/, `src="${newVideoUrl}"`);
    // Add the style to the video tag
    const styleToAdd = ` style="transform: scale(0.85); -webkit-mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%); transition: transform 0.3s;"`;
    return replacedSrc.replace('<video ', `<video ${styleToAdd} `);
});


// 3. Re-apply the Picsart banner image replacement (ChatGPT_Image)
const newBannerUrl = "https://firebasestorage.googleapis.com/v0/b/geminai-449212.firebasestorage.app/o/KEVINCOCO%2FPicsart_26-05-29_00-36-01-936.jpg.jpeg?alt=media&token=b0d81733-d5db-43ca-a337-22a70d74fbe6";
html = html.replace(/src="\/\/k-me-store-2\.myshopify\.com\/cdn\/shop\/files\/ChatGPT_Image_May_12_2026_12_50_23_PM\.png[^"]*"/g, `src="${newBannerUrl}"`);
html = html.replace(/srcset="\/\/k-me-store-2\.myshopify\.com\/cdn\/shop\/files\/ChatGPT_Image_May_12_2026_12_50_23_PM\.png[^"]*"/g, `srcset="${newBannerUrl}"`);


fs.writeFileSync(htmlPath, html);
console.log("Successfully reapplied the fixes.");
