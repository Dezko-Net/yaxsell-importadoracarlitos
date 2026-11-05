// @ts-nocheck
/* eslint-disable */
export function mountArgonAstraEngine(options = {}) {
  let _destroyed = false;
  let _rafId = 0;
  let _ro = null;
  const _winListeners = [];
  const _domListeners = [];
  const isLightQuality = options.quality === "light";
  const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const showParticles = options.showParticles !== false && !options.hideLogo && !options.hideParticles;

  function _addWinListener(type, fn, opts) {
    window.addEventListener(type, fn, opts);
    _winListeners.push([type, fn, opts]);
  }

  function _addDomListener(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    _domListeners.push([target, type, fn, opts]);
  }

  try {
    document.documentElement.dataset.theme = options.theme === "dark" ? "dark" : "light";
  } catch {}

  const canvasTest = document.getElementById('astra-canvas');
  if (!canvasTest) return { destroy() {} };

// =========================================================================
    // 1. EXACT CONSTANTS, SVG PATHS, PALETTES & CONFIG FROM OPENAI ASTRA + ARGON LOGO
    // =========================================================================
    const PARTICLE_MOTION_SETTLE_SECONDS = 6;
    const ASTRA_PARTICLE_OPACITY_REVEAL_END = 0.2;
    const ASTRA_AMBIENT_DRIFT_MIN = 0.035;
    const ASTRA_AMBIENT_DRIFT_MAX = 0.12;
    const ASTRA_AMBIENT_SPEED_MIN = 0.4;
    const ASTRA_AMBIENT_SPEED_MAX = 0.8;
    const ASTRA_PARALLAX_MIN = 0.08;
    const ASTRA_PARALLAX_MAX = 0.28;

    // 15 Exact Parametric Cubic Bezier Streams for the 3 Interlocking Ribbons of the Argon Logo
    const LOGO_SVG_PATHS = [
      // Left Ribbon (0..4): Bottom-Left Diagonal Seam -> Rounded Top Apex Seam (Purple -> Magenta -> Coral-Red)
      "M-15.064 288.786 C19.898 205.926 55.921 120.555 90.884 37.694 C99.34 23.738 119.821 22.645 131.262 32.154",
      "M-1.797 278.41 C29.798 203.577 62.351 126.476 93.945 51.643 C101.041 39.557 117.354 37.613 126.669 44.061",
      "M12.103 267.54 C40.169 201.116 69.087 132.679 97.153 66.255 C102.823 56.13 114.77 53.295 121.858 56.535",
      "M26.003 256.67 C50.541 198.655 75.822 138.882 100.361 80.867 C104.605 72.703 112.187 68.977 117.047 69.009",
      "M39.27 246.294 C60.441 196.306 82.252 144.803 103.422 94.816 C106.306 88.522 109.72 83.945 112.454 80.916",
      // Right Ribbon (5..9): Top Apex Diagonal Seam -> Bottom-Right Diagonal Seam (Amber-Gold -> Golden-Yellow -> Lemon-Gold)
      "M131.262 32.154 C168.724 117.187 207.322 204.798 244.784 289.831",
      "M126.669 44.061 C161.044 121.573 196.461 201.433 230.835 278.945",
      "M121.858 56.535 C152.998 126.167 185.083 197.908 216.223 267.54",
      "M117.047 69.009 C144.953 130.761 173.704 194.384 201.611 256.135",
      "M112.454 80.916 C137.273 135.146 162.844 191.019 187.662 245.249",
      // Bottom Chevron Ribbon (10..14): Bottom-Left Rounded Lobe -> Center Arch Peak -> Bottom-Right Rounded Lobe (Deep Teal -> Emerald -> Mint-Green)
      "M23.451 258.723 C25.598 258.257 32.447 255.214 33.422 254.454 C54.317 238.185 75.845 221.423 96.74 205.154 C107.825 197.281 120.501 197.281 131.586 205.154 C152.518 221.423 174.085 238.185 195.017 254.454 C195.994 255.214 202.842 258.257 204.988 258.808",
      "M13.755 266.293 C15.051 270.505 25.115 271.899 29.34 268.658 C51.975 251.294 75.296 233.404 97.931 216.04 C108.25 208.847 120.076 208.847 130.395 216.04 C153.18 233.404 176.655 251.294 199.44 268.658 C203.693 271.899 213.728 270.505 215.024 266.633",
      "M3.598 274.223 C4.003 283.335 16.91 289.708 25.063 283.538 C49.521 265.027 74.72 245.956 99.178 227.445 C108.695 220.965 119.63 220.965 129.148 227.445 C153.873 245.956 179.348 265.027 204.073 283.538 C212.315 289.708 225.133 283.335 225.538 274.83",
      "M-6.559 282.152 C-7.045 296.165 8.171 307.853 20.786 298.417 C47.067 278.76 74.144 258.507 100.425 238.85 C109.141 233.083 119.185 233.083 127.901 238.85 C154.566 258.507 182.04 278.76 208.706 298.417 C221.506 307.853 236.538 296.165 236.052 283.027",
      "M-16.255 289.722 C-17.592 308.413 -0.669 325.487 16.704 312.621 C44.725 291.869 73.595 270.488 101.616 249.736 C109.566 244.649 118.76 244.649 126.71 249.736 C155.228 270.488 184.611 291.869 213.129 312.621 C230.81 325.487 247.424 308.413 246.088 290.852"
    ];

    const LOGO_ORBIT_DEFS = [
      // Left Ribbon (Purple -> Magenta -> Coral-Red)
      { ribbonId: 0, depth:  0.34, phase: 0.08, speed: 0.022, strong: true,  scatterScale: 0.30, countBase: 145 },
      { ribbonId: 0, depth: -0.46, phase: 0.34, speed: 0.018, strong: false, scatterScale: 0.44, countBase: 120 },
      { ribbonId: 0, depth:  0.62, phase: 0.62, speed: 0.025, strong: true,  scatterScale: 0.50, countBase: 155 },
      { ribbonId: 0, depth: -0.40, phase: 0.81, speed: 0.019, strong: false, scatterScale: 0.44, countBase: 115 },
      { ribbonId: 0, depth:  0.28, phase: 0.19, speed: 0.021, strong: false, scatterScale: 0.28, countBase: 125 },
      // Right Ribbon (Amber-Gold -> Golden-Yellow -> Lemon-Yellow)
      { ribbonId: 1, depth: -0.34, phase: 0.24, speed: 0.022, strong: true,  scatterScale: 0.30, countBase: 140 },
      { ribbonId: 1, depth:  0.48, phase: 0.52, speed: 0.018, strong: false, scatterScale: 0.44, countBase: 115 },
      { ribbonId: 1, depth: -0.60, phase: 0.78, speed: 0.024, strong: true,  scatterScale: 0.50, countBase: 150 },
      { ribbonId: 1, depth:  0.40, phase: 0.12, speed: 0.017, strong: false, scatterScale: 0.44, countBase: 115 },
      { ribbonId: 1, depth: -0.26, phase: 0.44, speed: 0.020, strong: false, scatterScale: 0.28, countBase: 120 },
      // Bottom Chevron Arch (Deep Teal -> Cyan-Teal -> Emerald -> Mint-Green)
      { ribbonId: 2, depth:  0.30, phase: 0.15, speed: 0.021, strong: false, scatterScale: 0.28, countBase: 135 },
      { ribbonId: 2, depth: -0.46, phase: 0.48, speed: 0.018, strong: true,  scatterScale: 0.44, countBase: 130 },
      { ribbonId: 2, depth:  0.66, phase: 0.74, speed: 0.025, strong: true,  scatterScale: 0.50, countBase: 165 },
      { ribbonId: 2, depth: -0.42, phase: 0.92, speed: 0.017, strong: false, scatterScale: 0.44, countBase: 130 },
      { ribbonId: 2, depth:  0.36, phase: 0.31, speed: 0.022, strong: true,  scatterScale: 0.30, countBase: 150 }
    ];

    // Exact 3-stop gradients sampled from the uploaded Argon Logo (Left, Right, Bottom ribbons)
    const LOGO_RIBBON_GRADIENTS = [
      // Ribbon 0 (Left Leg): Deep Purple (#8E2488) -> Magenta-Rose (#D82666) -> Coral-Crimson (#FF2E4E)
      { start: "#8E2488", mid: "#D82666", end: "#FF2E4E", accents: ["#8E2488", "#B42678", "#D82666", "#FF2E4E", "#FF647E"] },
      // Ribbon 1 (Right Leg): Rich Amber (#FF9A10) -> Golden-Yellow (#FFCC1C) -> Bright Lemon (#FFE830)
      { start: "#FF9A10", mid: "#FFCC1C", end: "#FFE830", accents: ["#FF9A10", "#FFB516", "#FFCC1C", "#FFE830", "#FFF36B"] },
      // Ribbon 2 (Bottom Chevron): Deep Teal (#008496) -> Emerald-Teal (#00B68A) -> Vibrant Mint-Green (#00DE80)
      { start: "#008496", mid: "#00B68A", end: "#00DE80", accents: ["#008496", "#009E92", "#00B68A", "#00DE80", "#5SF4AC".replace("S", "E")] }
    ];

    const SIX_SVG_PATHS = [
      "M128.472 2.36011C65.4727 24.3601 10.7725 93.1601 9.97246 162.36C8.97246 248.86 79.4138 262.86 87.9725 262.86C116.973 262.86 135.973 244.36 135.973 221.36C135.973 189.86 102.973 193.86 102.973 209.36",
      "M224.973 31.8602C132.473 3.86011 29.9727 75.8601 29.9727 159.86C29.9727 247.86 98.4726 259.86 126.473 247.86",
      "M126.473 215.359C124.639 222.692 117.073 237.159 101.473 236.359C89.1905 235.729 76.0585 219.995 76.4724 195.859C76.4724 165.859 100.473 142.859 132.473 142.859C171.973 142.859 213.473 171.36 213.473 231.36C213.473 276.36 170.473 328.36 85.9727 316.86",
      "M106.973 237.36C81.9727 240.36 61.4727 222.86 61.4727 184.86C61.4727 153.36 91.9727 123.36 132.473 123.36C172.973 123.36 227.973 149.86 227.973 225.36C227.973 287.36 168.473 322.36 121.473 322.36C53.4727 322.36 10.9727 264.86 2.47266 208.36",
      "M114.973 211.36C114.973 225.86 92.4727 226.86 92.4727 205.36C92.4727 183.86 109.938 175.36 127.973 175.36C146.008 175.36 174.473 195.86 174.473 230.86C174.473 264.36 148.473 281.86 133.973 287.36C119.473 292.86 81.6727 296.56 54.4727 269.36"
    ];

    const ASTRA_CURSOR_PATH = "M9.60978 17.0223C9.24308 17.739 8.76808 18.189 8.18478 18.3723C7.60148 18.564 7.03478 18.4931 6.48478 18.1598C5.93478 17.8348 5.53061 17.314 5.27228 16.5973L0.672282 3.68478C0.497282 3.19312 0.455612 2.72645 0.547282 2.28478C0.638952 1.83478 0.838952 1.45561 1.14728 1.14728C1.45561 0.838948 1.83478 0.638949 2.28478 0.547279C2.73478 0.455619 3.20561 0.497279 3.69728 0.672279L16.6098 5.27228C17.3265 5.53062 17.8473 5.93478 18.1723 6.48478C18.5056 7.02648 18.5765 7.58898 18.3848 8.17228C18.2015 8.75558 17.7515 9.23058 17.0348 9.59728L12.1098 12.1098L9.60978 17.0223Z";

    const ASTRA_OPENAI_KNOT_PATHS = [
      "M1025.52 167.475C960.586 89.5754 862.821 40 753.477 40C557.968 40 399.477 198.491 399.477 394V737.278C399.477 757.119 409.975 775.478 427.074 785.541L851.477 1035.3",
      "M1465.07 608.95C1500.07 513.764 1494.12 404.309 1439.45 309.614C1341.69 140.298 1125.19 82.2866 955.872 180.041L658.585 351.68C641.402 361.6 630.752 379.872 630.587 399.712L626.49 892.135",
      "M1302.52 1210.35C1402.45 1193.06 1494.27 1133.18 1548.94 1038.49C1646.69 869.17 1588.68 652.667 1419.36 554.912L1122.08 383.273C1104.89 373.353 1083.75 373.265 1066.48 383.042L637.982 625.706",
      "M700.415 1370.27C765.351 1448.17 863.116 1497.74 972.461 1497.74C1167.97 1497.74 1326.46 1339.25 1326.46 1143.74V800.466C1326.46 780.625 1315.96 762.266 1298.86 752.203L874.461 502.444",
      "M260.866 928.794C225.871 1023.98 231.82 1133.44 286.492 1228.13C384.247 1397.45 600.75 1455.46 770.065 1357.7L1067.35 1186.06C1084.54 1176.14 1095.19 1157.87 1095.35 1138.03L1099.45 645.61",
      "M423.42 327.396C323.488 344.682 231.672 404.562 177 499.257C79.2456 668.573 137.257 885.076 306.573 982.83L603.861 1154.47C621.043 1164.39 642.192 1164.48 659.456 1154.7L1087.96 912.037"
    ];

    const ORBIT_DEFS = [
      { depth:  0.62, phase: 0.16, speed:  0.025, strong: true  },
      { depth: -0.46, phase: 0.72, speed: -0.018, strong: false },
      { depth:  0.78, phase: 0.38, speed:  0.021, strong: true  },
      { depth: -0.70, phase: 0.58, speed: -0.016, strong: false },
      { depth:  0.42, phase: 0.08, speed:  0.030, strong: true  }
    ];

    const SECONDARY_COLOR_SEEDS = [0.08, 0.58, 0.22, 0.68, 0.44];

    const PALETTES = {
      argon:  ["#FF3556", "#9B3088", "#FFD026", "#00D884", "#008E98"],
      astra:  ["#6DCBF4", "#7AB1FE", "#F87915", "#FA994C", "#F5F6FB"],
      aurora: ["#47E2C2", "#6DCBF4", "#B06DFF", "#E96AC8", "#F5F6FB"],
      ember:  ["#F7CB59", "#FA994C", "#F67576", "#B06DFF", "#F5F6FB"]
    };

    const CONFIG = {
      animationPlaying: true,
      animationPreset: "converge-tilt",
      bloomIntensity: 0.72,
      bloomThreshold: 0.08,
      colorMode: true,
      colorPalette: "argon",
      shapeMode: "logo",
      convergeDuration: 5.5,
      faceForward: true,
      interactionMode: "rotate",
      pathShapeAutoRotate: true,
      pathShapeAutoRotateAmount: 0.42,
      pathShapeAutoRotateSpeed: 0.22,
      pathShapeScatter: 1,
      rotationDepth: 1.4,
      scrollDisperseDistance: 1350,
      scrollEffects: true,
      scrollStarDriftSpeed: 3,
      scrollStartOffset: 0,
      scrollTextFadeDistance: 200,
      showCenterCluster: true,
      stars: {
        density: 4,
        densityFalloff: 0.22,
        flowInward: true,
        flowSpeed: 0.8,
        intensity: 1.35,
        scatter: 0.4,
        size: 2.05,
        sizeFalloff: 0.45,
        twinkleSpeed: 0.62
      },
      interaction: {
        depthDisplacement: 0.5,
        followDamping: 6,
        illumination: 0.55,
        magnification: 0.18,
        particleRepel: true,
        repelDistance: 52,
        repelFalloff: 2,
        repelHighlight: 0.16,
        repelHighlightRadius: 196,
        repelPressMultiplier: 2.2,
        repelRadius: 176,
        repelReturnSpring: 2.8,
        repelSpring: 7,
        rotationLag: 0.68,
        radius: 156,
        smearCurl: 0.24,
        smearTrailLength: 2.25
      },
      lensFlare: {
        animated: true,
        enabled: true,
        ghosts: 0.1,
        halo: 0.12,
        intensity: 0.28,
        secondary: 0.55,
        streakLength: 0.03485,
        streaks: 0.18,
        verticalStreaks: 1
      },
      dirtyGlass: {
        distortion: 0.68,
        drift: true,
        driftStrength: 0.28,
        enabled: true,
        grain: 0.031,
        procedural: 0,
        texture: 0
      },
      accretionExhale: {
        accretionRatio: 0.42,
        ambientAmount: 0.04,
        ambientSpeed: 0.55,
        coreIntensity: 1.45,
        duration: 8,
        exhaleStrength: 0.42,
        inwardStrength: 1.2,
        propagationSoftness: 0.16,
        settleDuration: 1.2,
        startScale: 0.58
      },
      grow: {
        duration: 8,
        growthSpeed: 0.55,
        softness: 0.075,
        startZoom: 4
      }
    };

    // Keep the exact Max particle population, paths, size and brightness.
    // Light mode saves work on the sky and interaction simulation instead.

    // =========================================================================
    // 2. MATH & DETERMINISTIC PRNG HELPERS (MATCHING THREE.JS r180)
    // =========================================================================
    const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = (x, min, max) => {
      if (x <= min) return 0;
      if (x >= max) return 1;
      const t = (x - min) / (max - min);
      return t * t * (3 - 2 * t);
    };
    const smootherstep = (x, min, max) => {
      if (x <= min) return 0;
      if (x >= max) return 1;
      const t = (x - min) / (max - min);
      return t * t * t * (t * (t * 6 - 15) + 10);
    };
    const damp = (x, y, lambda, dt) => lerp(x, y, 1 - Math.exp(-lambda * dt));
    const dampSnap = (x, y, dt, lambda = 6) => {
      const o = damp(x, y, lambda, dt);
      return Math.abs(y - o) <= 1e-4 ? y : o;
    };
    const positiveModulo = (x, m) => ((x % m) + m) % m;
    const degToRad = (d) => d * (Math.PI / 180);

    // Mulberry32 PRNG (exact match to function w(t) in 019ulkdkl8r2h.js)
    function mulberry32(seed) {
      let e = seed >>> 0;
      return () => {
        let t = (e += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
      };
    }

    function fractSinHash(t, e, a, r) {
      const o = 43758.5453 * Math.sin(t * a + e * r);
      return o - Math.floor(o);
    }

    function srgbToLinear(c) {
      return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
    }

    function hexToLinearRgb(hex) {
      const v = parseInt(hex.slice(1), 16);
      const r = ((v >> 16) & 255) / 255;
      const g = ((v >> 8) & 255) / 255;
      const b = (v & 255) / 255;
      return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
    }

    function writeStarColor(out, idx, colorMode, randVal, paletteName, customHexList = null) {
      if (!colorMode) {
        out[idx] = 1; out[idx + 1] = 1; out[idx + 2] = 1;
        return;
      }
      const hexList = customHexList || PALETTES[paletteName] || PALETTES.argon;
      const cIdx = randVal < 0.36 ? 0 : randVal < 0.56 ? 1 : randVal < 0.76 ? 2 : randVal < 0.90 ? 3 : 4;
      const rgb = hexToLinearRgb(hexList[cIdx]);
      out[idx] = rgb[0];
      out[idx + 1] = rgb[1];
      out[idx + 2] = rgb[2];
    }

    function densityProgress(t, falloff) {
      const r = positiveModulo(t, 1);
      return r + clamp(falloff, 0, 0.98) * Math.sin(r * Math.PI * 2) / (2 * Math.PI);
    }

    function middleWeightFn(t) {
      return Math.sin(clamp(t, 0, 1) * Math.PI);
    }

    function tipFade(t) {
      return smoothstep(t, 0, 0.055) * (1 - smoothstep(t, 0.945, 1));
    }

    function sizeFalloffFn(t, falloff) {
      return lerp(1, 0.14 + 0.86 * Math.pow(middleWeightFn(t), 0.68), clamp(falloff, 0, 1));
    }

    function particleMotionMass(s) {
      return lerp(0.65, 2.4, smoothstep(s, 1, 14));
    }

    // =========================================================================
    // 3. EXACT 2D & 3D BEZIER CURVE SAMPLING (MATCHING THREE.CurvePath & x)
    // =========================================================================
    function cubicBezier1D(t, p0, p1, p2, p3) {
      const mt = 1 - t;
      return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
    }

    class CubicBezierCurve2D {
      constructor(x0, y0, x1, y1, x2, y2, x3, y3) {
        this.x0 = x0; this.y0 = y0;
        this.x1 = x1; this.y1 = y1;
        this.x2 = x2; this.y2 = y2;
        this.x3 = x3; this.y3 = y3;
        this.arcLengthDivisions = 200;
        this.cacheArcLengths = null;
      }
      getPoint(t) {
        return {
          x: cubicBezier1D(t, this.x0, this.x1, this.x2, this.x3),
          y: cubicBezier1D(t, this.y0, this.y1, this.y2, this.y3)
        };
      }
      getLengths(divisions = this.arcLengthDivisions) {
        if (this.cacheArcLengths && this.cacheArcLengths.length === divisions + 1) {
          return this.cacheArcLengths;
        }
        const cache = [0];
        let sum = 0;
        let last = this.getPoint(0);
        for (let p = 1; p <= divisions; p++) {
          const current = this.getPoint(p / divisions);
          sum += Math.hypot(current.x - last.x, current.y - last.y);
          cache.push(sum);
          last = current;
        }
        this.cacheArcLengths = cache;
        return cache;
      }
      getLength() {
        const lengths = this.getLengths();
        return lengths[lengths.length - 1];
      }
      getUtoTmapping(u) {
        const arcLengths = this.getLengths();
        const il = arcLengths.length;
        const targetArcLength = u * arcLengths[il - 1];
        let low = 0, high = il - 1;
        while (low <= high) {
          const i = Math.floor(low + (high - low) / 2);
          const comparison = arcLengths[i] - targetArcLength;
          if (comparison < 0) low = i + 1;
          else if (comparison > 0) high = i - 1;
          else { high = i; break; }
        }
        const i = Math.max(0, high);
        if (arcLengths[i] === targetArcLength) return i / (il - 1);
        const lengthBefore = arcLengths[i];
        const lengthAfter = arcLengths[i + 1];
        const segmentLength = lengthAfter - lengthBefore;
        const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
        return (i + segmentFraction) / (il - 1);
      }
      getPointAt(u) {
        return this.getPoint(this.getUtoTmapping(u));
      }
    }

    class CurvePath2D {
      constructor(dString) {
        this.curves = [];
        this.cacheLengths = null;
        const tokens = dString.match(/[MC][^MC]*/gi) || [];
        let cx = 0, cy = 0;
        for (const cmd of tokens) {
          const type = cmd[0];
          const nums = (cmd.slice(1).trim().match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(Number);
          if (type === "M") {
            cx = nums[0]; cy = nums[1];
          } else if (type === "C") {
            for (let i = 0; i < nums.length; i += 6) {
              this.curves.push(new CubicBezierCurve2D(
                cx, cy,
                nums[i], nums[i + 1],
                nums[i + 2], nums[i + 3],
                nums[i + 4], nums[i + 5]
              ));
              cx = nums[i + 4]; cy = nums[i + 5];
            }
          }
        }
      }
      getCurveLengths() {
        if (this.cacheLengths) return this.cacheLengths;
        const lengths = [];
        let sums = 0;
        for (let i = 0; i < this.curves.length; i++) {
          sums += this.curves[i].getLength();
          lengths.push(sums);
        }
        this.cacheLengths = lengths;
        return lengths;
      }
      getPointAt(u) {
        const curveLengths = this.getCurveLengths();
        const d = u * curveLengths[curveLengths.length - 1];
        for (let i = 0; i < curveLengths.length; i++) {
          if (curveLengths[i] >= d) {
            const diff = curveLengths[i] - d;
            const curve = this.curves[i];
            const segmentLength = curve.getLength();
            const u2 = segmentLength === 0 ? 0 : 1 - diff / segmentLength;
            return curve.getPointAt(u2);
          }
        }
        return this.curves[this.curves.length - 1].getPointAt(1);
      }
    }

    // Exact 3D Spiral Curve (class x in 019ulkdkl8r2h.js)
    class AstraSpiralCurve3D {
      constructor(source2D, depth, rotationDepth, depthPhase) {
        this.source = source2D;
        this.depth = depth;
        this.rotationDepth = rotationDepth;
        this.depthPhase = depthPhase;
        this.arcLengthDivisions = 640;
        this.cacheArcLengths = null;
      }
      getPoint(t, out = [0, 0, 0]) {
        const r = clamp(t, 0, 1);
        const o = this.source.getPointAt(r);
        const i = Math.sin(r * Math.PI);
        const s = Math.sin(r * Math.PI * 1.35 + this.depthPhase) * this.depth * this.rotationDepth * i;
        out[0] = (o.x - 114.973) * (9.7 / 325);
        out[1] = (211.36 - o.y) * (9.7 / 325);
        out[2] = s;
        return out;
      }
      getLengths(divisions = this.arcLengthDivisions) {
        if (this.cacheArcLengths && this.cacheArcLengths.length === divisions + 1) {
          return this.cacheArcLengths;
        }
        const cache = [0];
        let sum = 0;
        const last = this.getPoint(0, [0, 0, 0]);
        const curr = [0, 0, 0];
        for (let p = 1; p <= divisions; p++) {
          this.getPoint(p / divisions, curr);
          sum += Math.hypot(curr[0] - last[0], curr[1] - last[1], curr[2] - last[2]);
          cache.push(sum);
          last[0] = curr[0]; last[1] = curr[1]; last[2] = curr[2];
        }
        this.cacheArcLengths = cache;
        return cache;
      }
      getUtoTmapping(u) {
        const arcLengths = this.getLengths();
        const il = arcLengths.length;
        const targetArcLength = u * arcLengths[il - 1];
        let low = 0, high = il - 1;
        while (low <= high) {
          const i = Math.floor(low + (high - low) / 2);
          const comparison = arcLengths[i] - targetArcLength;
          if (comparison < 0) low = i + 1;
          else if (comparison > 0) high = i - 1;
          else { high = i; break; }
        }
        const i = Math.max(0, high);
        if (arcLengths[i] === targetArcLength) return i / (il - 1);
        const lengthBefore = arcLengths[i];
        const lengthAfter = arcLengths[i + 1];
        const segmentLength = lengthAfter - lengthBefore;
        const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
        return (i + segmentFraction) / (il - 1);
      }
      getPointAt(u, out = [0, 0, 0]) {
        return this.getPoint(this.getUtoTmapping(u), out);
      }
      getTangentAt(u, out = [0, 0, 0]) {
        const delta = 0.0001;
        const u1 = Math.max(0, u - delta);
        const u2 = Math.min(1, u + delta);
        const p1 = this.getPointAt(u1, [0, 0, 0]);
        const p2 = this.getPointAt(u2, [0, 0, 0]);
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        out[0] = dx / len; out[1] = dy / len; out[2] = dz / len;
        return out;
      }
    }

    // Build 1024-sample texture data for morph shapes (cursor & openai-knot)
    function sampleSvgShapePaths(pathStrings, vbWidth, vbHeight) {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", `0 0 ${vbWidth} ${vbHeight}`);
      svg.style.position = "absolute";
      svg.style.width = "0";
      svg.style.height = "0";
      svg.style.visibility = "hidden";
      document.body.appendChild(svg);

      const segments = [];
      let totalLength = 0;
      for (const d of pathStrings) {
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", d);
        svg.appendChild(p);
        const len = p.getTotalLength();
        if (len > 0 && Number.isFinite(len)) {
          segments.push({ path: p, length: len });
          totalLength += len;
        }
      }

      const samples = new Float32Array(4096);
      let segIdx = 0;
      let accum = 0;
      for (let e = 0; e < 1024; e++) {
        const dist = ((e + 0.5) / 1024) * totalLength;
        while (segIdx < segments.length - 1 && dist > accum + segments[segIdx].length) {
          accum += segments[segIdx].length;
          segIdx++;
        }
        const seg = segments[segIdx];
        const pt = seg.path.getPointAtLength(dist - accum);
        const idx = 4 * e;
        samples[idx]     = pt.x / vbWidth - 0.5;
        samples[idx + 1] = 0.5 - pt.y / vbHeight;
        samples[idx + 2] = accum / totalLength;
        samples[idx + 3] = (accum + seg.length) / totalLength;
      }

      document.body.removeChild(svg);
      return { samples, aspectRatio: vbWidth / vbHeight };
    }

    // =========================================================================
    // 4. PROCEDURAL LENS DIRT TEXTURE (EXACT MATCH TO x(256, 192, 0xa57ad175))
    // =========================================================================
    function generateProceduralLensDirt(width = 256, height = 192, seed = 0xa57ad175) {
      const rng = mulberry32(seed);
      const gridNoise = (cols, rows) => {
        const values = new Float32Array(cols * rows);
        for (let i = 0; i < values.length; i++) values[i] = rng();
        return { columns: cols, rows, values };
      };
      const sampleGrid = (g, u, v) => {
        const x = clamp(u, 0, 1) * (g.columns - 1);
        const y = clamp(v, 0, 1) * (g.rows - 1);
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const x1 = Math.min(x0 + 1, g.columns - 1);
        const y1 = Math.min(y0 + 1, g.rows - 1);
        const sx = smoothstep(x - x0, 0, 1);
        const sy = smoothstep(y - y0, 0, 1);
        return (
          (g.values[y0 * g.columns + x0] * (1 - sx) + g.values[y0 * g.columns + x1] * sx) * (1 - sy) +
          (g.values[y1 * g.columns + x0] * (1 - sx) + g.values[y1 * g.columns + x1] * sx) * sy
        );
      };
      const gauss = () => (rng() + rng() + rng() + rng() + rng() + rng() - 3) / 3;
      const splat = (buf, w, h, cx, cy, rad, amp, s) => {
        const l = Math.max(rad, 0.5);
        const u0 = Math.max(0, Math.floor(cx - l - 1));
        const u1 = Math.min(w - 1, Math.ceil(cx + l + 1));
        const v0 = Math.max(0, Math.floor(cy - l - 1));
        const v1 = Math.min(h - 1, Math.ceil(cy + l + 1));
        for (let r = v0; r <= v1; r++) {
          for (let a = u0; a <= u1; a++) {
            const dist = Math.hypot(a - cx, r - cy) / l;
            if (dist >= 1) continue;
            let hh = Math.imul(a + 31 * s, 0x466f45d);
            hh ^= Math.imul(r + 17 * s, 0x127409f);
            hh = Math.imul(hh ^ (hh >>> 13), 0x4bf19f61);
            const c = ((hh ^ (hh >>> 16)) >>> 0) / 0x100000000;
            if (dist > 0.42 && c < 0.3 + 0.24 * dist) continue;
            const val = amp * (1 - smoothstep(dist, 0.48, 1)) * (0.52 + 0.48 * c);
            const idx = r * w + a;
            buf[idx] = Math.max(buf[idx], val);
          }
        }
      };

      const gA = gridNoise(13, 10);
      const gB = gridNoise(47, 35);
      const wipes = Array.from({ length: 7 }, () => {
        const ang = rng() * Math.PI;
        return {
          centerX: 0.08 + 0.84 * rng(),
          centerY: 0.08 + 0.84 * rng(),
          cosine: Math.cos(ang),
          frequency: 8 + 18 * rng(),
          phase: rng() * Math.PI * 2,
          radiusX: 0.08 + 0.18 * rng(),
          radiusY: 0.035 + 0.09 * rng(),
          sine: Math.sin(ang),
          strength: 0.035 + 0.075 * rng()
        };
      });

      const buf = new Float32Array(width * height);
      for (let r = 0; r < height; r++) {
        const v = r / Math.max(height - 1, 1);
        for (let c = 0; c < width; c++) {
          const u = c / Math.max(width - 1, 1);
          const n1 = sampleGrid(gA, u, v);
          const n2 = sampleGrid(gB, u, v);
          const h = rng();
          const d = smoothstep(0.68 * n1 + 0.32 * n2, 0.43, 0.74);
          let m = 0.018 + 0.032 * n1 + 0.022 * n2 + 0.012 * h + d * (0.038 + 0.032 * h);
          for (const w of wipes) {
            const dx = u - w.centerX, dy = v - w.centerY;
            const ox = (dx * w.cosine + dy * w.sine) / w.radiusX;
            const oy = (-dx * w.sine + dy * w.cosine) / w.radiusY;
            const nSq = ox * ox + oy * oy;
            if (nSq >= 1) continue;
            const s = 1 - smoothstep(Math.sqrt(nSq), 0.18, 1);
            const l = Math.pow(0.5 + 0.5 * Math.sin((0.72 * ox + oy) * w.frequency + w.phase), 8);
            m += w.strength * s * (0.18 + 0.82 * l) * (0.5 + 0.5 * h);
          }
          const g = rng();
          if (g > 0.965) m += 0.5 * Math.pow((g - 0.965) / 0.035, 1.8);
          buf[r * width + c] = m;
        }
      }

      const clusters = Array.from({ length: 18 }, () => ({
        x: rng() * width,
        y: rng() * height,
        spreadX: width * (0.022 + 0.095 * rng()),
        spreadY: height * (0.018 + 0.075 * rng())
      }));
      const count1 = Math.max(32, Math.round((width * height) / 58));
      for (let i = 0; i < count1; i++) {
        let ax = rng() * width, ay = rng() * height;
        if (rng() < 0.58) {
          const cl = clusters[Math.floor(rng() * clusters.length)];
          ax = cl.x + gauss() * cl.spreadX;
          ay = cl.y + gauss() * cl.spreadY;
        }
        splat(buf, width, height, ax, ay, 0.52 + 1.15 * Math.pow(rng(), 3), 0.24 + 0.7 * Math.pow(rng(), 1.8), seed + i);
      }
      const count2 = Math.max(6, Math.round((width * height) / 4000));
      for (let i = 0; i < count2; i++) {
        const ax = rng() * width, ay = rng() * height;
        const s = 2 + Math.floor(4 * rng());
        const u = 0.28 + 0.5 * rng();
        for (let c = 0; c < s; c++) {
          splat(buf, width, height, ax + 3.5 * gauss(), ay + 3.5 * gauss(), 1.2 + 3.8 * rng(), u * (0.55 + 0.45 * rng()), seed + 7 * i + c);
        }
      }
      const count3 = Math.max(3, Math.round((width * height) / 20000));
      for (let i = 0; i < count3; i++) {
        const ax = rng() * width, ay = rng() * height;
        const ang = rng() * Math.PI * 2;
        const len = width * (0.08 + 0.22 * rng());
        const steps = Math.max(1, Math.ceil(len / 0.7));
        const amp = 0.07 + 0.15 * rng();
        for (let h = 0; h <= steps; h++) {
          if (rng() < 0.28) continue;
          const p = h / steps;
          const d = 0.9 * gauss();
          splat(
            buf, width, height,
            ax + Math.cos(ang) * len * p - Math.sin(ang) * d,
            ay + Math.sin(ang) * len * p + Math.cos(ang) * d,
            0.45 + 0.45 * rng(),
            amp * (0.55 + 0.45 * rng()),
            seed + 131 * i + h
          );
        }
      }

      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < buf.length; i++) {
        const v = Math.round(255 * Math.pow(clamp(buf[i], 0, 1), 0.94));
        const idx = 4 * i;
        rgba[idx] = v; rgba[idx + 1] = v; rgba[idx + 2] = v; rgba[idx + 3] = 255;
      }
      return rgba;
    }

    // =========================================================================
    // 5. EXACT GLSL SHADERS FROM OPENAI ASTRA (019ulkdkl8r2h.js & 0oa8a-34g3h86.js)
    // =========================================================================
    const GLSL_COAST = `
      vec4 astraCoast(vec4 state, float mass, float age) {
        float drag = 2.3 / sqrt(mass);
        float velocityDecay = exp(-drag * age);
        float returnDecay = exp(-age);
        state.xy = state.xy * returnDecay
          + state.zw * (returnDecay - velocityDecay) / (drag - 1.0);
        state.zw *= velocityDecay;
        return state;
      }
    `;

    const GLSL_PARTICLE_MOTION = `
      attribute vec3 particleMotionUv;
      uniform sampler2D uParticleMotionTexture;
      uniform float uParticleMotionEnabled;
      uniform float uParticleMotionAge;
      uniform vec2 uParticleMotionPointer;
      uniform vec2 uParticleMotionPrevious;
      uniform vec2 uParticleMotionImpulse;
      varying vec4 vParticleMotionState;

      ${GLSL_COAST}
      void astraParticleMotion(inout vec4 clipPosition) {
        if (uParticleMotionEnabled < 0.5 || uParticleMotionAge >= 6.0) return;
        float mass = particleMotionUv.z;
        vec4 state = astraCoast(texture2D(uParticleMotionTexture, particleMotionUv.xy), mass, uParticleMotionAge);
        #ifdef ASTRA_PARTICLE_SIMULATION
          float aspect = max(uViewportAspect, 0.0001);
          vec2 scale = vec2(aspect, 1.0);
          vec2 current = (clipPosition.xy / clipPosition.w + state.xy) * scale;
          vec2 start = uParticleMotionPrevious * scale;
          vec2 segment = (uParticleMotionPointer - uParticleMotionPrevious) * scale;
          float t = clamp(dot(current - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
          float radius = max(uPointerRepelRadius * 0.5, 0.025);
          float weight = pow(1.0 - smoothstep(0.0, radius, length(current - start - segment * t)), 2.0);
          vec2 impulse = uParticleMotionImpulse * scale;
          impulse *= min(1.0, 0.18 / max(length(impulse), 0.00001));
          state.zw += impulse / scale * weight * 5.4 / mass;
          float speed = length(state.zw * scale);
          state.zw *= min(1.0, 0.5 / max(speed, 0.00001));
          vParticleMotionState = state;
          gl_PointSize = 1.0;
          clipPosition = vec4(particleMotionUv.xy * 2.0 - 1.0, 0.0, 1.0);
        #else
          clipPosition.xy += state.xy * clipPosition.w;
        #endif
      }
    `;

    const GLSL_STAR_VERTEX = `
      precision highp float;
      attribute vec3 position;
      attribute float orbitProgress;
      attribute float starAcrossOffset;
      attribute float starBrightness;
      attribute vec3 starColor;
      attribute float starDepthOffset;
      attribute float starHero;
      attribute float starBackground;
      attribute float starOpacity;
      attribute float starScale;
      attribute float twinklePhase;
      attribute float twinkleRate;

      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform mat4 viewMatrix;
      uniform mat4 uBackgroundModelMatrix;

      uniform float uIntensity;
      uniform float uIntroProgress;
      uniform float uBackgroundStarsEnabled;
      uniform float uAccretionRatio;
      uniform float uAmbientPulse;
      uniform float uCoreIntensity;
      uniform float uDensityFalloff;
      uniform float uDispersedMotion;
      uniform float uFlowSpeed;
      uniform float uExhaleStrength;
      uniform float uFormationEnabled;
      uniform float uFormationProgress;
      uniform float uGrowthEnabled;
      uniform float uGrowthDirection;
      uniform float uGrowthProgress;
      uniform float uGrowthRadius;
      uniform float uGrowthSoftness;
      uniform float uInwardStrength;
      uniform float uLensActive;
      uniform float uLensDepth;
      uniform float uLensIllumination;
      uniform float uLensMagnification;
      uniform vec2 uLensPointer;
      uniform float uLensRadius;
      uniform float uPointerRepelRadius;
      uniform vec2 uPathShapeCenter;
      uniform float uPathShapeBrightRetention;
      uniform float uPathShapeDepth;
      uniform float uPathShapeDepthPhase;
      uniform float uPathShapeMotion;
      uniform float uPathShapeProgress;
      uniform float uPathShapePositionProgress;
      uniform vec2 uPathShapeRotation;
      uniform float uPathShapeScatter;
      uniform float uPathShapeSampleCount;
      uniform vec2 uPathShapeSize;
      uniform vec2 uPathShapeTrackedScatter;
      uniform float uPathShapeTrackedSeed;
      uniform float uPathShapeTrackingEnabled;
      uniform float uTrackedClearanceSeed;
      uniform vec3 uTrackedScatter;
      uniform sampler2D uPathShapeTexture;
      uniform vec2 uScatterSize;
      uniform float uScrollDrift;
      uniform float uScrollScatter;
      uniform float uScrollPositionProgress;
      uniform float uScrollSizeScale;
      uniform float uSpiralTilt;
      uniform vec2 uTextBounds;
      uniform float uPathMotion;
      uniform float uPathOffset;
      uniform float uPathSampleCount;
      uniform float uPathSpeed;
      uniform float uPixelRatio;
      uniform float uSizeFalloff;
      uniform float uPropagationSoftness;
      uniform float uSettleRatio;
      uniform float uTime;
      uniform float uTwinkleSpeed;
      uniform sampler2D uPathTexture;
      uniform float uViewportAspect;
      uniform float uSeamEnvelope;
      uniform float uUseRibbonGradient;
      uniform vec3 uRibbonColorStart;
      uniform vec3 uRibbonColorMid;
      uniform vec3 uRibbonColorEnd;
      uniform float uTheme;

      varying float vBrightness;
      varying vec3 vColor;
      varying float vLens;
      varying float vOpacity;
      varying float vRayStrength;
      varying float vParticleDiameter;

      ${GLSL_PARTICLE_MOTION}

      float astraParticleRevealProgress(float progress, float seed) {
        float delay = seed * 0.015;
        return smoothstep(delay, 0.14 + delay, progress)
          * mix(0.2, 1.0, smoothstep(0.2, 1.0, progress));
      }

      vec2 astraDispersedMotion(
        float time,
        float scatterX,
        float scatterY,
        float scatterZ,
        float scrollDrift,
        float strength
      ) {
        float depth = clamp(scatterZ, 0.0, 1.0);
        float motion = clamp(strength, 0.0, 1.0);
        float speed = mix(${ASTRA_AMBIENT_SPEED_MIN}, ${ASTRA_AMBIENT_SPEED_MAX}, depth);
        float amount = mix(${ASTRA_AMBIENT_DRIFT_MIN}, ${ASTRA_AMBIENT_DRIFT_MAX}, depth) * motion;
        float phaseX = scatterX * 6.28318530718 + scatterY * 2.7;
        float phaseY = scatterY * 6.28318530718 + scatterZ * 3.1;
        float parallax = scrollDrift * mix(${ASTRA_PARALLAX_MIN}, ${ASTRA_PARALLAX_MAX}, depth * depth) * motion;
        return vec2(
          (sin(phaseX + time * speed) - sin(phaseX)) * amount,
          (cos(phaseY + time * speed * 0.73) - cos(phaseY)) * amount + parallax
        );
      }

      vec3 astraIntroMotion(
        vec3 pos, vec3 scattered, float progress,
        float seed, float travelSeed
      ) {
        if (progress >= 1.0) return pos;
        float start = 0.14 + seed * 0.18;
        float duration = 0.58 + travelSeed * 0.1;
        float local = clamp((progress - start) / duration, 0.0, 1.0);
        float smoothPull = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
        float pull = mix(smoothPull, sin(smoothPull * 3.14159265359 * 0.5), 0.5);
        float angle = sin(pull * 3.14159265359) * (0.44 + seed * 0.22);
        float c = cos(angle);
        float s = sin(angle);
        vec3 orbiting = vec3(
          scattered.x * c - scattered.y * s,
          scattered.x * s + scattered.y * c,
          scattered.z
        );
        return mix(orbiting, pos, pull);
      }

      vec3 astraTiltSpiral(vec3 pos, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return vec3(
          pos.x,
          pos.y * cosine - pos.z * sine,
          pos.y * sine + pos.z * cosine
        );
      }

      vec3 samplePath(float progress) {
        float scaledProgress = clamp(progress, 0.0, 1.0) * (uPathSampleCount - 1.0);
        float lowerIndex = floor(scaledProgress);
        float upperIndex = min(lowerIndex + 1.0, uPathSampleCount - 1.0);
        float blend = fract(scaledProgress);
        vec3 lowerPoint = texture2D(uPathTexture, vec2((lowerIndex + 0.5) / uPathSampleCount, 0.5)).xyz;
        vec3 upperPoint = texture2D(uPathTexture, vec2((upperIndex + 0.5) / uPathSampleCount, 0.5)).xyz;
        return mix(lowerPoint, upperPoint, blend);
      }

      vec4 samplePathShape(float progress) {
        float scaledProgress = clamp(progress, 0.0, 1.0) * (uPathShapeSampleCount - 1.0);
        float lowerIndex = floor(scaledProgress);
        float upperIndex = min(lowerIndex + 1.0, uPathShapeSampleCount - 1.0);
        float blend = fract(scaledProgress);
        vec4 lowerPoint = texture2D(uPathShapeTexture, vec2((lowerIndex + 0.5) / uPathShapeSampleCount, 0.5));
        vec4 upperPoint = texture2D(uPathShapeTexture, vec2((upperIndex + 0.5) / uPathShapeSampleCount, 0.5));
        return mix(lowerPoint, upperPoint, blend);
      }

      vec2 samplePathShapeRange(float progress) {
        float sampleIndex = min(
          floor(clamp(progress, 0.0, 0.999999) * uPathShapeSampleCount),
          uPathShapeSampleCount - 1.0
        );
        return texture2D(uPathShapeTexture, vec2((sampleIndex + 0.5) / uPathShapeSampleCount, 0.5)).zw;
      }

      void main() {
        float pathPhase = fract(orbitProgress + uPathOffset);
        float effDensityFalloff = mix(uDensityFalloff, uDensityFalloff * 0.25, uSeamEnvelope);
        float targetProgress = pathPhase + effDensityFalloff * sin(pathPhase * 6.28318530718) / 6.28318530718;
        float outwardTarget = uGrowthDirection > 0.0 ? targetProgress : 1.0 - targetProgress;
        float growthBirth = outwardTarget * 0.24;
        float growthLocal = clamp((uGrowthProgress - growthBirth) / max(1.0 - growthBirth, 0.0001), 0.0, 1.0);
        float growthTravel = growthLocal * growthLocal * (3.0 - 2.0 * growthLocal);
        float growthStart = uGrowthDirection > 0.0 ? 0.0 : 1.0;
        float emittedProgress = mix(growthStart, targetProgress, growthTravel);
        float progress = mix(targetProgress, emittedProgress, uGrowthEnabled);
        float growthVisibility = smoothstep(growthBirth, growthBirth + 0.025, uGrowthProgress);
        float middleWeight = sin(clamp(progress, 0.0, 1.0) * 3.14159265359);
        float rawSizeEnvelope = mix(1.0, 0.14 + 0.86 * pow(max(middleWeight, 0.0), 0.68), uSizeFalloff);
        float rawEndpointVis = smoothstep(0.0, 0.055, progress) * (1.0 - smoothstep(0.945, 1.0, progress));
        float seamSizeEnvelope = mix(0.84, 1.04, pow(max(middleWeight, 0.0), 0.45));
        float seamEndpointVis = smoothstep(0.0, 0.014, progress) * (1.0 - smoothstep(0.986, 1.0, progress));
        float sizeEnvelope = mix(rawSizeEnvelope, seamSizeEnvelope, uSeamEnvelope);
        float endpointVisibility = mix(rawEndpointVis, seamEndpointVis, uSeamEnvelope);
        vec3 animatedPosition = position;

        if (uPathMotion > 0.5) {
          if (uScrollPositionProgress < 1.0 || uFormationEnabled > 0.5 || uGrowthEnabled > 0.5) {
            float tangentStep = 1.0 / max(uPathSampleCount - 1.0, 1.0);
            vec3 pathPosition = samplePath(progress);
            vec3 before = samplePath(max(progress - tangentStep, 0.0));
            vec3 after = samplePath(min(progress + tangentStep, 1.0));
            vec3 tangent = normalize(after - before);
            vec3 across = normalize(vec3(-tangent.y, tangent.x, 0.0));
            animatedPosition = pathPosition
              + across * starAcrossOffset * mix(1.0, growthTravel, uGrowthEnabled)
              + vec3(0.0, 0.0, starDepthOffset * mix(1.0, growthTravel, uGrowthEnabled));
          }
        } else {
          sizeEnvelope = 1.0;
          endpointVisibility = 1.0;
        }

        float radialDistance = length(animatedPosition.xy);
        float localProgress = clamp(uFormationProgress - radialDistance * uPropagationSoftness * 0.018, 0.0, 1.0);
        float accretionEnd = clamp(uAccretionRatio, 0.12, 0.72);
        float settleStart = max(accretionEnd + 0.08, 1.0 - uSettleRatio);
        float inward = smoothstep(0.0, accretionEnd, localProgress);
        float exhale = smoothstep(accretionEnd, settleStart, localProgress);
        vec2 radialDirection = animatedPosition.xy / max(radialDistance, 0.0001);
        vec3 farPosition = animatedPosition;
        farPosition.xy += radialDirection * uInwardStrength * (2.0 + radialDistance * 0.28);
        farPosition.z += uInwardStrength * 0.8;
        vec3 condensedPosition = vec3(animatedPosition.xy * 0.045, animatedPosition.z * 0.12);
        vec3 formedPosition = mix(farPosition, condensedPosition, inward);
        formedPosition = mix(formedPosition, animatedPosition, exhale);
        formedPosition.xy += radialDirection * sin(exhale * 3.14159265359) * (1.0 - exhale) * uExhaleStrength;
        float formationVisibility = mix(0.06, 0.58, inward);
        formationVisibility = mix(formationVisibility, 1.0, exhale);
        float coreBurst = exp(-pow((localProgress - accretionEnd) * 11.0, 2.0));
        animatedPosition = mix(animatedPosition, formedPosition, uFormationEnabled);

        float scatterX = fract(sin(dot(vec2(orbitProgress, twinklePhase), vec2(127.1, 311.7))) * 43758.5453);
        float scatterY = fract(sin(dot(vec2(twinklePhase, starScale), vec2(269.5, 183.3))) * 43758.5453);
        float scatterZ = fract(sin(dot(vec2(orbitProgress, starBrightness), vec2(419.2, 371.9))) * 43758.5453);
        float clearanceSeed = fract(sin(dot(vec2(starOpacity, twinkleRate), vec2(157.3, 283.9))) * 43758.5453);
        float trackedStarWeight = starHero * uPathShapeTrackingEnabled;
        scatterX = mix(scatterX, uTrackedScatter.x, trackedStarWeight);
        scatterY = mix(scatterY, uTrackedScatter.y, trackedStarWeight);
        scatterZ = mix(scatterZ, uTrackedScatter.z, trackedStarWeight);
        clearanceSeed = mix(clearanceSeed, uTrackedClearanceSeed, trackedStarWeight);
        float keepInCenter = step(0.25, clearanceSeed);
        float scatterSide = scatterX < 0.5 ? -1.0 : 1.0;
        float outerProgress = sqrt(fract(scatterX * 2.0));
        float outerX = scatterSide * mix(
          scatterSide < 0.0 ? -uTextBounds.x : uTextBounds.y,
          uScatterSize.x * 0.5,
          outerProgress
        );
        vec3 scatteredPosition = vec3(
          mix(outerX, (scatterX - 0.5) * uScatterSize.x, keepInCenter),
          (scatterY - 0.5) * uScatterSize.y,
          (scatterZ - 0.5) * 1.4
        );
        vec2 dispersedOffset = astraDispersedMotion(uTime, scatterX, scatterY, scatterZ, uScrollDrift, uDispersedMotion);
        scatteredPosition.x += dispersedOffset.x;
        scatteredPosition.y = mod(scatteredPosition.y + dispersedOffset.y + uScatterSize.y * 0.5, uScatterSize.y) - uScatterSize.y * 0.5;
        scatteredPosition.y -= sin(uScrollPositionProgress * 3.14159265359) * (0.15 + scatterZ * 0.25);

        float nightWeight = clamp(1.0 - uTheme, 0.0, 1.0);
        float nightDisperse = nightWeight * uScrollPositionProgress;
        scatteredPosition.xy *= (1.0 + nightDisperse * 1.35);
        scatteredPosition.z *= (1.0 + nightDisperse * 0.95);
        scatteredPosition.xy += normalize(scatteredPosition.xy + vec2(0.0001, 0.0001)) * (nightDisperse * 0.55);

        vec3 introScattered = vec3(
          (scatterX - 0.5) * uScatterSize.x,
          (fract(scatterY) - 0.5) * uScatterSize.y,
          (scatterZ - 0.5) * 0.5
        );
        float backgroundStar = starBackground * uBackgroundStarsEnabled;
        animatedPosition = astraTiltSpiral(animatedPosition, uSpiralTilt);
        animatedPosition = mix(animatedPosition, introScattered, backgroundStar);
        animatedPosition = mix(animatedPosition, scatteredPosition, uScrollPositionProgress);
        endpointVisibility = mix(endpointVisibility, 1.0, uScrollScatter);
        sizeEnvelope = mix(sizeEnvelope, 1.0, uScrollScatter);

        float pathShapeProgress = uPathShapeProgress * (1.0 - backgroundStar);
        float pathShapePositionProgress = uPathShapePositionProgress * (1.0 - backgroundStar);
        float pathShapeDepthCue = 1.0;
        float pathShapeOpacityCue = 1.0;
        float pathShapeBrightKeep = 1.0;
        float shapeBaseSeed = fract(orbitProgress * 0.754877666 + twinklePhase * 0.159154943 + starScale * 0.117);
        float pathShapeTrackingWeight = trackedStarWeight;
        shapeBaseSeed = mix(shapeBaseSeed, uPathShapeTrackedSeed, pathShapeTrackingWeight);

        if (pathShapeProgress > 0.0 || pathShapePositionProgress > 0.0) {
          vec2 shapeRange = samplePathShapeRange(shapeBaseSeed);
          float shapeRangeSpan = max(shapeRange.y - shapeRange.x, 1.0 / uPathShapeSampleCount);
          float shapeLocalSeed = clamp((shapeBaseSeed - shapeRange.x) / shapeRangeSpan, 0.0, 1.0);
          float shapeLocalPhase = fract(shapeLocalSeed + uPathShapeMotion / shapeRangeSpan);
          float shapeLocalProgress = shapeLocalPhase + uDensityFalloff * sin(shapeLocalPhase * 6.28318530718) / 6.28318530718;
          float shapeSeed = mix(shapeRange.x, shapeRange.y, shapeLocalProgress);
          float shapeStep = 1.0 / max(uPathShapeSampleCount - 1.0, 1.0);
          vec3 pathShapePosition = samplePathShape(shapeSeed).xyz;
          vec2 pathShapeBefore = samplePathShape(max(shapeSeed - shapeStep, shapeRange.x)).xy * uPathShapeSize;
          vec2 pathShapeAfter = samplePathShape(min(shapeSeed + shapeStep, shapeRange.y)).xy * uPathShapeSize;
          vec2 pathShapeTangent = normalize(pathShapeAfter - pathShapeBefore + vec2(0.0001, 0.0));
          vec2 pathShapeAcross = vec2(-pathShapeTangent.y, pathShapeTangent.x);
          float pathShapeRandomAcrossScatter = mix((scatterX + scatterY - 1.0) * 0.12, uPathShapeTrackedScatter.x, pathShapeTrackingWeight);
          float pathShapeScatter = (starAcrossOffset * 1.1 + pathShapeRandomAcrossScatter) * uPathShapeScatter;
          float pathShapeDepthEnvelope = sin(shapeLocalProgress * 3.14159265359);
          float pathShapeContourDepth = sin(shapeLocalProgress * 3.14159265359 * 1.35 + uPathShapeDepthPhase) * uPathShapeDepth * pathShapeDepthEnvelope;
          float pathShapeRandomDepthScatter = mix((scatterZ - 0.5) * 0.22, uPathShapeTrackedScatter.y, pathShapeTrackingWeight);
          vec3 pathShapeOffset = vec3(
            pathShapePosition.xy * uPathShapeSize + pathShapeAcross * pathShapeScatter,
            pathShapeContourDepth + starDepthOffset * 0.75 + pathShapeRandomDepthScatter
          );
          pathShapeOffset.z *= uPathShapeScatter;
          float pathShapeCosX = cos(uPathShapeRotation.x);
          float pathShapeSinX = sin(uPathShapeRotation.x);
          pathShapeOffset = vec3(
            pathShapeOffset.x,
            pathShapeOffset.y * pathShapeCosX - pathShapeOffset.z * pathShapeSinX,
            pathShapeOffset.y * pathShapeSinX + pathShapeOffset.z * pathShapeCosX
          );
          float pathShapeCosY = cos(uPathShapeRotation.y);
          float pathShapeSinY = sin(uPathShapeRotation.y);
          pathShapeOffset = vec3(
            pathShapeOffset.x * pathShapeCosY + pathShapeOffset.z * pathShapeSinY,
            pathShapeOffset.y,
            -pathShapeOffset.x * pathShapeSinY + pathShapeOffset.z * pathShapeCosY
          );
          pathShapePosition = vec3(uPathShapeCenter, 0.0) + pathShapeOffset;
          float pathShapeFrontness = smoothstep(-1.15, 1.15, pathShapeOffset.z);
          pathShapeDepthCue = mix(0.78, 1.18, pathShapeFrontness);
          pathShapeOpacityCue = mix(0.72, 1.0, pathShapeFrontness);
          float pathShapeMiddleWeight = sin(clamp(shapeLocalProgress, 0.0, 1.0) * 3.14159265359);
          float pathShapeSizeEnvelope = mix(1.0, 0.14 + 0.86 * pow(max(pathShapeMiddleWeight, 0.0), 0.68), uSizeFalloff);
          float pathShapeEndpointVisibility = smoothstep(0.0, 0.055, shapeLocalProgress) * (1.0 - smoothstep(0.945, 1.0, shapeLocalProgress));
          float pathShapeBrightSeed = fract(sin(dot(vec2(orbitProgress, twinklePhase), vec2(193.7, 417.2))) * 43758.5453);
          pathShapeBrightKeep = max(starHero, step(1.0 - uPathShapeBrightRetention, pathShapeBrightSeed));
          animatedPosition = mix(animatedPosition, pathShapePosition, pathShapePositionProgress);
          endpointVisibility = mix(endpointVisibility, pathShapeEndpointVisibility, pathShapeProgress);
          sizeEnvelope = mix(sizeEnvelope, pathShapeSizeEnvelope, pathShapeProgress);
        }

        animatedPosition = astraIntroMotion(
          animatedPosition, introScattered, mix(uIntroProgress, 1.0, backgroundStar),
          scatterZ, scatterY
        );
        float twinkle = 0.86 + 0.14 * sin(twinklePhase + uTime * uTwinkleSpeed * twinkleRate);
        float brightStarWeight = smoothstep(1.35, 1.65, starBrightness);
        float pathShapeSuppressedBright = pathShapeProgress * brightStarWeight * (1.0 - pathShapeBrightKeep);
        vBrightness = uIntensity * starBrightness * twinkle
          * mix(1.0, uAmbientPulse + coreBurst * (uCoreIntensity - 1.0), uFormationEnabled)
          * mix(1.0, pathShapeDepthCue, pathShapeProgress)
          * mix(1.0, 0.42, pathShapeSuppressedBright);
        vec3 ribbonGrad = progress < 0.5
          ? mix(uRibbonColorStart, uRibbonColorMid, progress * 2.0)
          : mix(uRibbonColorMid, uRibbonColorEnd, (progress - 0.5) * 2.0);
        float ribbonColorActive = uUseRibbonGradient * (1.0 - backgroundStar) * (1.0 - max(uScrollPositionProgress * 0.2, pathShapeProgress * 0.65));
        vColor = mix(starColor, mix(ribbonGrad, starColor, 0.08), ribbonColorActive);

        // Celestial galaxy star colors in night mode when scrolling into Segment 2
        float starColorSeed = fract(scatterX * 11.73 + scatterY * 23.41 + scatterZ * 5.19);
        vec3 galaxyStarColor;
        if (starColorSeed < 0.50) {
          galaxyStarColor = vec3(1.0, 1.0, 1.0); // Brilliant diamond white star
        } else if (starColorSeed < 0.72) {
          galaxyStarColor = vec3(0.70, 0.88, 1.0); // Cosmic starlight cyan / blue
        } else if (starColorSeed < 0.86) {
          galaxyStarColor = vec3(0.88, 0.80, 1.0); // Nebula stardust lilac / violet
        } else {
          galaxyStarColor = vec3(1.0, 0.94, 0.78); // Warm stellar diamond amber
        }

        float galaxyStarTransition = nightWeight * smoothstep(0.12, 0.80, uScrollPositionProgress);
        vColor = mix(vColor, galaxyStarColor, galaxyStarTransition);

        vOpacity = starOpacity
          * endpointVisibility
          * (0.92 + twinkle * 0.08)
          * mix(1.0, formationVisibility, uFormationEnabled);
        vOpacity *= mix(1.0, growthVisibility, uGrowthEnabled);
        vOpacity *= mix(1.0, pathShapeOpacityCue, pathShapeProgress);

        // In night mode on Segment 2, gracefully thin out background particles so it's not overcrowded
        float nightThinning = nightWeight * smoothstep(0.15, 0.85, uScrollPositionProgress) * step(0.38, scatterZ);
        vOpacity *= (1.0 - nightThinning * 0.58);

        vRayStrength = smoothstep(1.45, 2.8, starBrightness) * mix(1.0, pathShapeBrightKeep, pathShapeProgress);
        float scrollSizeScale = mix(uScrollSizeScale, 1.0, pathShapeProgress * brightStarWeight * pathShapeBrightKeep);
        float introLocalProgress = astraParticleRevealProgress(uIntroProgress, scatterZ);
        float backgroundPresence = backgroundStar * max(1.0 - uScrollScatter, uPathShapeProgress);
        scrollSizeScale = mix(scrollSizeScale, 1.0, backgroundPresence);
        vOpacity *= mix(1.0, uBackgroundStarsEnabled, starBackground);
        introLocalProgress = mix(introLocalProgress, min(introLocalProgress, 0.2), backgroundPresence);
        float introParticleScale = sqrt(introLocalProgress);
        vOpacity *= smoothstep(0.0, 0.2, introLocalProgress);
        float galaxySizeMod = mix(1.0, 0.85 + 0.35 * starColorSeed, galaxyStarTransition);
        gl_PointSize = uPixelRatio
          * (0.35 + starScale * sizeEnvelope * endpointVisibility * 3.8)
          * (0.97 + twinkle * 0.03)
          * mix(1.0, 1.0 + coreBurst * 0.42, uFormationEnabled)
          * mix(1.0, 0.3 + growthVisibility * 0.7, uGrowthEnabled)
          * scrollSizeScale
          * mix(1.0, pathShapeDepthCue, pathShapeProgress)
          * introParticleScale
          * galaxySizeMod;

        vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        if (backgroundStar > 0.5) {
          viewPosition = viewMatrix * (uBackgroundModelMatrix * vec4(animatedPosition, 1.0));
        }
        vec4 clipPosition = projectionMatrix * viewPosition;
        vec2 ndc = clipPosition.xy / max(clipPosition.w, 0.0001);
        vLens = 0.0;
        if (uLensActive > 0.0) {
          float lensDistance = length(ndc - uLensPointer);
          vLens = (1.0 - smoothstep(0.0, uLensRadius, lensDistance)) * uLensActive;
          viewPosition.z += vLens * uLensDepth;
          clipPosition = projectionMatrix * viewPosition;
          clipPosition.xy = uLensPointer * clipPosition.w
            + (clipPosition.xy - uLensPointer * clipPosition.w) * (1.0 + vLens * uLensMagnification);
        }
        vBrightness *= 1.0 + vLens * uLensIllumination;
        gl_PointSize *= 1.0 + vLens * uLensMagnification * 0.7;
        vParticleDiameter = gl_PointSize;
        gl_PointSize = max(gl_PointSize, 4.0);
        astraParticleMotion(clipPosition);
        gl_Position = clipPosition;
      }
    `;

    const GLSL_STAR_FRAGMENT = `
      precision highp float;
      uniform float uTheme;
      varying float vBrightness;
      varying vec3 vColor;
      varying float vLens;
      varying float vOpacity;
      varying float vRayStrength;
      varying float vParticleDiameter;

      float astraCubicCoverage(float coordinate) {
        float x = abs(coordinate);
        if (x < 1.0) return (4.0 - 6.0 * x * x + 3.0 * x * x * x) / 6.0;
        float tail = max(2.0 - x, 0.0);
        return tail * tail * tail / 6.0;
      }
      float astraFilteredCore(vec2 pixel, float area) {
        return astraCubicCoverage(pixel.x) * astraCubicCoverage(pixel.y)
          * area * vParticleDiameter * vParticleDiameter;
      }

      void main() {
        vec2 pixel = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * max(vParticleDiameter, 4.0);
        vec2 point = pixel * 2.0 / max(vParticleDiameter, 0.0001);
        float distanceToCenter = length(point);
        float disc = 1.0 - smoothstep(0.08, 1.0, distanceToCenter);
        float core = pow(disc, 2.2);
        float horizontalRay = exp(-abs(point.y) * 28.0)
          * (1.0 - smoothstep(0.18, 1.0, abs(point.x)));
        float verticalRay = exp(-abs(point.x) * 28.0)
          * (1.0 - smoothstep(0.18, 1.0, abs(point.y)));
        float rays = max(horizontalRay, verticalRay) * 0.28 * vRayStrength;
        float resolved = smoothstep(2.0, 4.0, vParticleDiameter);
        float alpha = mix(astraFilteredCore(pixel, 0.150904), max(core, rays), resolved)
          * vOpacity;

        if (alpha <= 0.0) {
          discard;
        }

        float whiteCore = mix(0.45, pow(core, 1.75), resolved)
          * smoothstep(1.1, 3.1, vBrightness)
          * 0.44;
        float colorEnergy = 1.0 - min(vColor.r, min(vColor.g, vColor.b));
        vec3 emission = mix(vColor, vec3(1.0), whiteCore)
          * vBrightness
          * (1.0 + colorEnergy * 0.54);
        gl_FragColor = vec4(emission, alpha);
      }
    `;

    const GLSL_SIM_FRAGMENT = `
      precision highp float;
      varying vec4 vParticleMotionState;
      void main() {
        gl_FragColor = vParticleMotionState;
      }
    `;

    const GLSL_QUAD_VERTEX = `
      precision highp float;
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const GLSL_BLOOM_THRESHOLD_FRAG = `
      precision highp float;
      uniform sampler2D inputBuffer;
      uniform vec2 sourceTexelSize;
      uniform float threshold;
      uniform float smoothing;
      varying vec2 vUv;
      float luminance(vec3 c) {
        return dot(c, vec3(0.2126729, 0.7151522, 0.0721750));
      }
      void main() {
        vec2 offset = sourceTexelSize * 0.5;
        vec4 color = (
          texture2D(inputBuffer, vUv + vec2(-offset.x, -offset.y)) +
          texture2D(inputBuffer, vUv + vec2( offset.x, -offset.y)) +
          texture2D(inputBuffer, vUv + vec2(-offset.x,  offset.y)) +
          texture2D(inputBuffer, vUv + vec2( offset.x,  offset.y))
        ) * 0.25;
        gl_FragColor = color * smoothstep(threshold, threshold + smoothing, luminance(color.rgb));
      }
    `;

    const GLSL_BLOOM_BLUR_FRAG = `
      precision highp float;
      uniform sampler2D source;
      uniform vec2 stepSize;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(source, vUv) * 0.2270270270;
        color += (texture2D(source, vUv + stepSize * 1.3846153846)
          + texture2D(source, vUv - stepSize * 1.3846153846)) * 0.3162162162;
        color += (texture2D(source, vUv + stepSize * 3.2307692308)
          + texture2D(source, vUv - stepSize * 3.2307692308)) * 0.0702702703;
        gl_FragColor = color;
      }
    `;

    // Exact AstraLensFlare + Dirty Glass + Bloom Composite + ACES Filmic Shader
    const GLSL_COMPOSITE_VERTEX = `
      precision highp float;
      attribute vec2 position;
      varying vec2 vUv;
      uniform sampler2D uParticleMotionTexture;
      uniform float uParticleMotionAge;
      uniform vec3 uPrimaryMotionUv;
      uniform vec3 uSecondaryMotionUvs[5];
      varying vec2 vPrimaryMotion;
      varying vec2 vSecondaryMotion[5];
      ${GLSL_COAST}
      vec2 particleOffset(vec3 particleUv) {
        if (particleUv.x < 0.0 || uParticleMotionAge >= 6.0) return vec2(0.0);
        return astraCoast(texture2D(uParticleMotionTexture, particleUv.xy), particleUv.z, uParticleMotionAge).xy * 0.5;
      }
      void main() {
        vUv = position * 0.5 + 0.5;
        vPrimaryMotion = particleOffset(uPrimaryMotionUv);
        for (int i = 0; i < 5; i++) {
          vSecondaryMotion[i] = particleOffset(uSecondaryMotionUvs[i]);
        }
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const GLSL_COMPOSITE_FRAGMENT = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vPrimaryMotion;
      varying vec2 vSecondaryMotion[5];

      uniform sampler2D inputBuffer;
      uniform sampler2D uBloomLow;
      uniform sampler2D uBloomMid;
      uniform sampler2D uBloomHigh;
      uniform float uBloomIntensity;

      uniform sampler2D uDirtTexture;
      uniform sampler2D uCloudTexture;
      uniform vec2 uCenter;
      uniform float uAnimated;
      uniform float uAspect;
      uniform float uDirtyGlassEnabled;
      uniform float uDistortion;
      uniform float uDirtTextureAspect;
      uniform vec2 uDirtTextureOffset;
      uniform float uDirtTextureRotation;
      uniform float uFlareEnabled;
      uniform float uGhosts;
      uniform float uGrain;
      uniform float uHalo;
      uniform float uIntensity;
      uniform float uProceduralDirt;
      uniform vec2 uSecondaryCenters[5];
      uniform float uSecondaryIntensity;
      uniform float uSecondaryVisibility[5];
      uniform float uStreakLength;
      uniform float uStreaks;
      uniform float uTime;
      uniform float uTextureDirt;
      uniform float uVerticalStreaks;
      uniform float uVisibility;
      uniform float uTheme;
      uniform float uLightQuality;
      uniform float uScrollProgress;
      uniform float uShowLogo;

      float astraHash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float softDisc(vec2 point, float radius, float softness) {
        return 1.0 - smoothstep(radius - softness, radius + softness, length(point));
      }

      float softRing(vec2 point, float radius, float width) {
        float distanceToRing = abs(length(point) - radius);
        return 1.0 - smoothstep(width, width * 2.0, distanceToRing);
      }

      vec2 aspectCorrect(vec2 point) {
        point.x *= uAspect;
        return point;
      }

      vec2 coverTextureUv(vec2 uv, float viewportAspect, float textureAspect) {
        vec2 centeredUv = uv - 0.5;
        if (viewportAspect > textureAspect) {
          centeredUv.y *= textureAspect / viewportAspect;
        } else {
          centeredUv.x *= viewportAspect / textureAspect;
        }
        return centeredUv + 0.5;
      }

      float secondaryFlare(vec2 center, vec2 uv) {
        vec2 point = aspectCorrect(uv - center);
        float distanceToSource = length(point);
        float nearHalo = exp(-distanceToSource * distanceToSource * 520.0) * 0.1;
        float halo = exp(-distanceToSource * 17.0) * 0.055;
        float horizontalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(point.x));
        float verticalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(point.y));
        horizontalWindow = mix(horizontalWindow, 1.0, step(0.99, uStreakLength));
        verticalWindow = mix(verticalWindow, 1.0, step(0.99, uStreakLength));
        float horizontalStreak = exp(-abs(point.y) * 360.0) * exp(-abs(point.x) * 10.0) * horizontalWindow * 0.24;
        float verticalStreak = exp(-abs(point.x) * 360.0) * exp(-abs(point.y) * 10.0) * verticalWindow * 0.24 * uVerticalStreaks;
        return nearHalo + halo + horizontalStreak + verticalStreak;
      }

      vec3 ACESFilmicToneMapping(vec3 color) {
        color *= 1.0;
        const mat3 ACESInputMat = mat3(
          0.59719, 0.07600, 0.02840,
          0.35458, 0.90834, 0.13383,
          0.04823, 0.01566, 0.83777
        );
        const mat3 ACESOutputMat = mat3(
          1.60475, -0.10208, -0.00327,
          -0.53108, 1.10813, -0.07276,
          -0.07367, -0.00605, 1.07602
        );
        color = ACESInputMat * color;
        vec3 a = color * (color + 0.0245786) - 0.000090537;
        vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
        color = clamp(ACESOutputMat * (a / b), 0.0, 1.0);
        return color;
      }

      vec3 linearToSRGB(vec3 value) {
        return mix(
          pow(max(value, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055),
          value * 12.92,
          vec3(lessThanEqual(value, vec3(0.0031308)))
        );
      }

      // Quintic C2-continuous 2D procedural noise (zero grid artifacts)
      float skyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = astraHash(i);
        float b = astraHash(i + vec2(1.0, 0.0));
        float c = astraHash(i + vec2(0.0, 1.0));
        float d = astraHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      // Fast 4-octave FBM for turbulent domain warping & god-ray occlusion
      float warpFbm(vec2 p, vec2 wind) {
        float val = 0.0;
        float amp = 0.52;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          val += amp * skyNoise(p + wind);
          p = rot * p * 2.04 + vec2(11.4, 23.8);
          wind *= 1.32;
          amp *= 0.49;
        }
        return val;
      }

      // 7-octave Domain-Warped Cellular-Cumulus FBM (rolling, morphing cauliflower billows)
      float cumulusFbm(vec2 p, float t, float speed) {
        // Turbulent curl / domain-warp field that makes clouds actively churn and billow as they drift
        vec2 drift = vec2(t * speed, t * speed * 0.22);
        vec2 q = vec2(
          warpFbm(p * 0.65 + drift * 0.6, vec2(t * 0.035, -t * 0.022)),
          warpFbm(p * 0.65 + vec2(5.2, 1.3) + drift * 0.6, vec2(-t * 0.028, t * 0.038))
        );
        vec2 warpedP = p + (q - 0.5) * 0.62 + drift;

        float val = 0.0;
        float amp = 0.50;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 octaveWind = vec2(t * speed * 0.42, t * speed * 0.14);
        for (int i = 0; i < 7; i++) {
          float n = skyNoise(warpedP + octaveWind);
          float billow = 1.0 - abs(n * 2.0 - 1.0);
          float weight = (i < 3) ? 0.48 : 0.28;
          val += amp * mix(n, billow * billow, weight);
          warpedP = rot * warpedP * 2.06 + vec2(17.3, 31.7);
          octaveWind = rot * octaveWind * 1.26;
          amp *= 0.485;
        }
        return val;
      }

      void main() {
        vec2 uv = vUv;
        #ifdef ASTRA_LIGHT_QUALITY
        {
          vec3 stars = texture2D(inputBuffer, uv).rgb;
          vec3 bloom = (
            texture2D(uBloomHigh, uv).rgb * 0.46 +
            texture2D(uBloomMid, uv).rgb * 0.36 +
            texture2D(uBloomLow, uv).rgb * 0.28
          ) * uBloomIntensity;
          vec3 base = stars + bloom;
          float baseLuminance = dot(base, vec3(0.2126, 0.7152, 0.0722));

          // Keep the same lens flare rendering as Max mode.
          vec2 movingCenter = uCenter + vPrimaryMotion;
          vec2 source = aspectCorrect(uv - movingCenter);
          float sourceDistance = length(source);
          float core = exp(-sourceDistance * sourceDistance * 480.0) * 0.18;
          float halo = exp(-sourceDistance * 11.5) * uHalo;
          halo += softRing(source, 0.105, 0.006) * 0.05 * uHalo;
          float horizontalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(source.x));
          float verticalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(source.y));
          horizontalWindow = mix(horizontalWindow, 1.0, step(0.99, uStreakLength));
          verticalWindow = mix(verticalWindow, 1.0, step(0.99, uStreakLength));
          float horizontalStreak = exp(-abs(source.y) * 310.0) * exp(-abs(source.x) * 7.5) * horizontalWindow;
          float softHorizontalStreak = exp(-abs(source.y) * 78.0) * exp(-abs(source.x) * 5.2) * horizontalWindow * 0.16;
          float verticalStreak = exp(-abs(source.x) * 310.0) * exp(-abs(source.y) * 7.5) * verticalWindow;
          float softVerticalStreak = exp(-abs(source.x) * 78.0) * exp(-abs(source.y) * 5.2) * verticalWindow * 0.16;
          float streak = (horizontalStreak + softHorizontalStreak + (verticalStreak + softVerticalStreak) * uVerticalStreaks) * uStreaks;
          vec2 opticalAxis = vec2(0.5) - movingCenter;
          vec2 ghostA = aspectCorrect(uv - (movingCenter + opticalAxis * 0.82));
          vec2 ghostB = aspectCorrect(uv - (movingCenter + opticalAxis * 1.38));
          vec2 ghostC = aspectCorrect(uv - (movingCenter + opticalAxis * 1.82));
          float ghosts = (
            softDisc(ghostA, 0.016, 0.014) * 0.18 +
            softRing(ghostB, 0.046, 0.006) * 0.11 +
            softDisc(ghostC, 0.025, 0.02) * 0.08
          ) * uGhosts;
          float flare = (core + halo + streak + ghosts) * uIntensity;
          float secondary = 0.0;
          float secondaryDirtHalo = 0.0;
          for (int i = 0; i < 5; i++) {
            vec2 secondaryCenter = uSecondaryCenters[i] + vSecondaryMotion[i];
            secondary += secondaryFlare(secondaryCenter, uv) * uSecondaryVisibility[i];
            secondaryDirtHalo += exp(-length(aspectCorrect(uv - secondaryCenter)) * 10.0) * uSecondaryVisibility[i];
          }
          secondary *= uIntensity * uSecondaryIntensity;
          vec3 flareColor = vec3(0.956) * (flare * uVisibility + secondary) * uFlareEnabled;

          vec2 driftingDirtUv = uv - 0.5;
          float dirtRotationCos = cos(uDirtTextureRotation);
          float dirtRotationSin = sin(uDirtTextureRotation);
          driftingDirtUv = mat2(dirtRotationCos, -dirtRotationSin, dirtRotationSin, dirtRotationCos) * driftingDirtUv;
          driftingDirtUv += uDirtTextureOffset;
          vec2 dirtTextureUv = clamp(coverTextureUv(driftingDirtUv + 0.5, uAspect, uDirtTextureAspect), vec2(0.001), vec2(0.999));
          vec3 dirtTextureColor = texture2D(uDirtTexture, dirtTextureUv).rgb;
          float dirtTextureLuminance = dot(dirtTextureColor, vec3(0.2126, 0.7152, 0.0722));
          float photographicDirt = smoothstep(0.1, 0.72, dirtTextureLuminance);
          float proceduralDirt = smoothstep(0.025, 0.32, dirtTextureLuminance);
          float textureDirtAmount = uTextureDirt * uDirtyGlassEnabled;
          float proceduralDirtAmount = uProceduralDirt * uDirtyGlassEnabled;
          float dirtMask = clamp(photographicDirt * textureDirtAmount + proceduralDirt * proceduralDirtAmount, 0.0, 1.0);
          float dirtVariation = clamp((photographicDirt - 0.4) * textureDirtAmount + (proceduralDirt - 0.4) * proceduralDirtAmount, -0.7, 0.9);
          float dirtReveal = smoothstep(0.008, 0.2, baseLuminance) * (1.0 - smoothstep(0.9, 3.0, baseLuminance) * 0.68);
          float dirtHalo = (exp(-sourceDistance * 6.5) * uVisibility + secondaryDirtHalo * uSecondaryIntensity) * uIntensity * uFlareEnabled;
          vec3 opticalColor = base + flareColor;
          opticalColor *= 1.0 + dirtVariation * dirtReveal * 0.82;
          opticalColor += vec3(max(dirtVariation, 0.0)) * dirtReveal * (0.022 + min(baseLuminance, 0.8) * 0.055);
          opticalColor += vec3(0.956) * dirtHalo * dirtMask * 0.14;
          float grain = astraHash(floor(uv * vec2(1536.0, 1024.0)));
          opticalColor += vec3((grain - 0.5) * uGrain) * (0.18 + dirtReveal * 0.82) * uDirtyGlassEnabled;
          vec3 darkMapped = ACESFilmicToneMapping(max(opticalColor, vec3(0.0)));

          // Same Rayleigh/Mie sky and four cloud layers as Max mode; the cloud
          // shapes come from a precomputed low-cost texture instead of FBM loops.
          vec2 aspectUv = (uv - vec2(0.5)) * vec2(max(uAspect, 1.0), 1.0);
          float centerDist = length(aspectUv);
          // Reserve an airy oval around the entire mark, including its three
          // corners. Widen it on phones and feather clouds toward the perimeter.
          float logoHalfWidth = mix(0.54, 0.36, smoothstep(0.80, 1.60, uAspect));
          vec2 logoSpace = (uv - vec2(0.5, 0.52)) / vec2(logoHalfWidth, 0.64);
          float logoPocket = (1.0 - smoothstep(0.88, 1.30, length(logoSpace)))
                           * (1.0 - smoothstep(0.05, 0.90, uScrollProgress))
                           * uShowLogo;
          vec3 skyCosmos = vec3(0.018, 0.065, 0.210);
          vec3 skyUpper = vec3(0.048, 0.145, 0.380);
          vec3 skyMid = vec3(0.095, 0.245, 0.520);
          vec3 skyHorizon = vec3(0.280, 0.455, 0.700);
          vec3 skyWarmth = vec3(0.420, 0.360, 0.480);
          float y1 = smoothstep(0.0, 0.38, uv.y);
          float y2 = smoothstep(0.28, 0.72, uv.y);
          float y3 = smoothstep(0.60, 1.0, uv.y);
          vec3 sky = mix(skyHorizon, skyMid, y1);
          sky = mix(sky, skyUpper, y2);
          sky = mix(sky, skyCosmos, y3);
          sky += skyWarmth * pow(clamp(1.0 - uv.y, 0.0, 1.0), 3.2) * 0.22;

          vec2 sunPos = vec2(-0.52 * max(uAspect, 1.0), 0.38);
          vec2 toSun = sunPos - aspectUv;
          float sunDist = length(toSun);
          vec2 sunDir = normalize(vec2(-0.68, 0.73));
          sky += vec3(0.22, 0.27, 0.35) * exp(-sunDist * 1.85);
          sky += vec3(0.35, 0.32, 0.26) * exp(-sunDist * 5.5);

          vec2 camShift = uDirtTextureOffset * 6.5 + vec2(0.0, -uScrollProgress * 0.55);
          float persp = 1.0 / (0.46 + uv.y * 0.72);
          vec2 cloudP = vec2(aspectUv.x * persp * 1.65, (uv.y - 0.48) * persp * 2.15) + camShift;

          vec2 cirrusCoord = vec2(cloudP.x * 1.4 + cloudP.y * 0.6, cloudP.y * 2.4 - cloudP.x * 0.3) + vec2(4.2, -1.9);
          float cirrusWave = texture2D(uCloudTexture, cirrusCoord * 0.055 + vec2(uTime * 0.002, uTime * 0.0007)).g;
          float cirrusFine = texture2D(uCloudTexture, cirrusCoord * 0.15 + vec2(uTime * 0.004, -uTime * 0.001)).b;
          float cirrusMask = smoothstep(0.50, 0.80, cirrusWave * 0.82 + cirrusFine * 0.18)
                           * smoothstep(0.18, 0.88, uv.y) * 0.42;
          cirrusMask *= 1.0 - logoPocket;
          vec3 cirrusCol = mix(vec3(0.38, 0.52, 0.74), vec3(0.75, 0.83, 0.94), exp(-sunDist * 1.4));
          sky = mix(sky, cirrusCol, cirrusMask);

          vec2 rayUv = (aspectUv + toSun * 0.42) * 0.075 + camShift * 0.12;
          float rayOcclusion = texture2D(uCloudTexture, rayUv).r;
          float godRayAccum = (1.0 - smoothstep(0.42, 0.68, rayOcclusion)) * exp(-sunDist * 1.35) * smoothstep(0.05, 0.85, uv.y);
          godRayAccum *= 1.0 - logoPocket * 0.90;
          sky += vec3(0.20, 0.25, 0.34) * godRayAccum * 0.68;

          float skyWindow = mix(0.68, 1.12, smoothstep(0.10, 0.66, centerDist));
          float horizonArch = mix(1.10, 0.90, smoothstep(0.0, 0.68, uv.y));
          vec2 cumCoord = cloudP * 1.18 + vec2(2.3, 4.7);
          float rawShape = texture2D(uCloudTexture, cumCoord * 0.14 + vec2(uTime * 0.0028, -uTime * 0.0009)).r;
          float detail = texture2D(uCloudTexture, cumCoord * 0.32 + vec2(11.2, -7.4) + vec2(uTime * 0.0048, -uTime * 0.0016)).g;
          float sculpted = (rawShape * 0.76 + detail * 0.24) * skyWindow * horizonArch;
          float cloudDensity = smoothstep(0.45, 0.75, sculpted);
          cloudDensity *= 1.0 - logoPocket;
          float s1 = texture2D(uCloudTexture, (cumCoord + sunDir * 0.075) * 0.14 + vec2(uTime * 0.0028, -uTime * 0.0009)).r;
          float s2 = texture2D(uCloudTexture, (cumCoord + sunDir * 0.180) * 0.14 + vec2(uTime * 0.0028, -uTime * 0.0009)).r;
          float opticalDepth = max(0.0, s1 - rawShape) * 1.85 + max(0.0, s2 - rawShape) * 1.10;
          float transmittance = exp(-opticalDepth * 1.45);
          float powder = 1.0 - exp(-cloudDensity * 2.8);
          float directLight = clamp(0.48 + transmittance * (0.32 + 0.35 * powder) + (uv.y - 0.25) * 0.10, 0.0, 1.0);
          float rimLight = pow(clamp(1.0 - cloudDensity * 0.80, 0.0, 1.0), 2.0) * smoothstep(0.43, 0.64, sculpted) * transmittance;
          vec3 cloudSoftBase = max(sky * 0.96, vec3(0.240, 0.390, 0.630));
          vec3 cloudMidAmbient = max(sky * 1.08, vec3(0.420, 0.560, 0.760));
          vec3 cloudWarmRim = vec3(0.650, 0.745, 0.875);
          vec3 cloudSunCrown = vec3(0.840, 0.895, 0.968);
          vec3 cloudCol = mix(cloudSoftBase, cloudMidAmbient, smoothstep(0.25, 0.58, directLight));
          cloudCol = mix(cloudCol, cloudWarmRim, smoothstep(0.50, 0.78, directLight));
          cloudCol = mix(cloudCol, cloudSunCrown, smoothstep(0.70, 0.98, directLight));
          cloudCol += vec3(0.20, 0.23, 0.28) * rimLight;

          // The same foreground depth as Max, sampled from the baked field.
          vec2 fgCoord = cloudP * 1.35 + vec2(0.0, -uTime * 0.0035);
          float fgShape = texture2D(uCloudTexture, fgCoord * 0.18 + vec2(0.31, 0.67)).b;
          float fgMask = smoothstep(0.52, 0.82, fgShape) * (1.0 - smoothstep(0.0, 0.48, uv.y));
          fgMask *= 1.0 - logoPocket;
          vec3 fgCol = mix(cloudSoftBase, cloudSunCrown, 0.48 + transmittance * 0.32);
          vec3 skyWithClouds = mix(sky, cloudCol, cloudDensity * 0.88);
          skyWithClouds = mix(skyWithClouds, fgCol, fgMask * 0.68);
          float cloudPresence = max(cloudDensity, fgMask);
          vec3 cloudBounce = bloom * (0.48 + 0.92 * cloudPresence) * uShowLogo;
          vec3 litSky = skyWithClouds + cloudBounce * 0.65;
          float dmPeak = max(darkMapped.r, max(darkMapped.g, darkMapped.b));
          vec3 baseCanvas = clamp(litSky, 0.0, 1.0) * (1.0 - dmPeak * 0.45);
          vec3 lightSkyComp = 1.0 - (1.0 - baseCanvas) * (1.0 - darkMapped);
          vec3 finalColor = mix(darkMapped, lightSkyComp, uTheme);
          gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          return;
        }
        #else
        vec3 bloom = (
          texture2D(uBloomHigh, uv).rgb * 0.46 +
          texture2D(uBloomMid, uv).rgb * 0.36 +
          texture2D(uBloomLow, uv).rgb * 0.28
        ) * uBloomIntensity;
        vec3 base = texture2D(inputBuffer, uv).rgb + bloom;

        vec2 movingCenter = uCenter + vPrimaryMotion;
        vec2 source = aspectCorrect(uv - movingCenter);
        float sourceDistance = length(source);

        float core = exp(-sourceDistance * sourceDistance * 480.0) * 0.18;
        float halo = exp(-sourceDistance * 11.5) * uHalo;
        halo += softRing(source, 0.105, 0.006) * 0.05 * uHalo;

        float horizontalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(source.x));
        float verticalWindow = 1.0 - smoothstep(uStreakLength * 0.72, uStreakLength, abs(source.y));
        horizontalWindow = mix(horizontalWindow, 1.0, step(0.99, uStreakLength));
        verticalWindow = mix(verticalWindow, 1.0, step(0.99, uStreakLength));
        float horizontalStreak = exp(-abs(source.y) * 310.0) * exp(-abs(source.x) * 7.5) * horizontalWindow;
        float softHorizontalStreak = exp(-abs(source.y) * 78.0) * exp(-abs(source.x) * 5.2) * horizontalWindow * 0.16;
        float verticalStreak = exp(-abs(source.x) * 310.0) * exp(-abs(source.y) * 7.5) * verticalWindow;
        float softVerticalStreak = exp(-abs(source.x) * 78.0) * exp(-abs(source.y) * 5.2) * verticalWindow * 0.16;
        float streak = (
          horizontalStreak +
          softHorizontalStreak +
          (verticalStreak + softVerticalStreak) * uVerticalStreaks
        ) * uStreaks;

        vec2 opticalAxis = vec2(0.5) - movingCenter;
        vec2 ghostA = aspectCorrect(uv - (movingCenter + opticalAxis * 0.82));
        vec2 ghostB = aspectCorrect(uv - (movingCenter + opticalAxis * 1.38));
        vec2 ghostC = aspectCorrect(uv - (movingCenter + opticalAxis * 1.82));
        float ghosts = 0.0;
        ghosts += softDisc(ghostA, 0.016, 0.014) * 0.18;
        ghosts += softRing(ghostB, 0.046, 0.006) * 0.11;
        ghosts += softDisc(ghostC, 0.025, 0.02) * 0.08;
        ghosts *= uGhosts;

        float flare = (core + halo + streak + ghosts) * uIntensity;
        float secondary = 0.0;
        float secondaryDirtHalo = 0.0;
        for (int i = 0; i < 5; i++) {
          vec2 secondaryCenter = uSecondaryCenters[i] + vSecondaryMotion[i];
          secondary += secondaryFlare(secondaryCenter, uv) * uSecondaryVisibility[i];
          secondaryDirtHalo += exp(-length(aspectCorrect(uv - secondaryCenter)) * 10.0) * uSecondaryVisibility[i];
        }
        secondary *= uIntensity * uSecondaryIntensity;
        vec3 flareColor = vec3(0.956, 0.956, 0.956) * (flare * uVisibility + secondary) * uFlareEnabled;

        vec3 opticalColor = base + flareColor;
        float baseLuminance = dot(base, vec3(0.2126, 0.7152, 0.0722));
        float reveal = smoothstep(0.025, 0.72, baseLuminance);
        vec2 driftingDirtUv = uv - 0.5;
        float dirtRotationCos = cos(uDirtTextureRotation);
        float dirtRotationSin = sin(uDirtTextureRotation);
        driftingDirtUv = mat2(
          dirtRotationCos, -dirtRotationSin,
          dirtRotationSin,  dirtRotationCos
        ) * driftingDirtUv;
        driftingDirtUv += uDirtTextureOffset;
        vec2 dirtTextureUv = clamp(coverTextureUv(
          driftingDirtUv + 0.5,
          uAspect,
          uDirtTextureAspect
        ), vec2(0.001), vec2(0.999));
        vec3 dirtTextureColor = texture2D(uDirtTexture, dirtTextureUv).rgb;
        float dirtTextureLuminance = dot(dirtTextureColor, vec3(0.2126, 0.7152, 0.0722));
        float photographicDirt = smoothstep(0.1, 0.72, dirtTextureLuminance);
        float proceduralDirt = smoothstep(0.025, 0.32, dirtTextureLuminance);
        float textureDirtAmount = uTextureDirt * uDirtyGlassEnabled;
        float proceduralDirtAmount = uProceduralDirt * uDirtyGlassEnabled;
        float dirtMask = clamp(
          photographicDirt * textureDirtAmount + proceduralDirt * proceduralDirtAmount,
          0.0, 1.0
        );
        float dirtVariation = clamp(
          (photographicDirt - 0.4) * textureDirtAmount + (proceduralDirt - 0.4) * proceduralDirtAmount,
          -0.7, 0.9
        );
        float dirtReveal = smoothstep(0.008, 0.2, baseLuminance)
          * (1.0 - smoothstep(0.9, 3.0, baseLuminance) * 0.68);
        float primaryDirtHalo = exp(-sourceDistance * 6.5) * uVisibility;
        float dirtHalo = (primaryDirtHalo + secondaryDirtHalo * uSecondaryIntensity) * uIntensity * uFlareEnabled;

        vec2 warpUvX = dirtTextureUv * vec2(0.72, 0.78) + vec2(0.17, 0.08);
        vec2 warpUvY = vec2(1.0 - dirtTextureUv.y, dirtTextureUv.x) * vec2(0.74, 0.7) + vec2(0.12, 0.16);
        float warpSampleX = texture2D(uDirtTexture, warpUvX).r;
        float warpSampleY = texture2D(uDirtTexture, warpUvY).r;
        vec2 warpField = clamp((vec2(warpSampleX, warpSampleY) - dirtTextureLuminance) * 6.0, vec2(-0.5), vec2(0.5));
        vec2 warp = warpField * vec2(1.0 / max(uAspect, 0.001), 1.0) * uDistortion * 0.004;
        vec3 warpedBase = texture2D(inputBuffer, clamp(uv + warp, vec2(0.001), vec2(0.999))).rgb + bloom;
        opticalColor += (warpedBase - base) * reveal * uDirtyGlassEnabled * 0.55;

        opticalColor *= 1.0 + dirtVariation * dirtReveal * 0.82;
        opticalColor += vec3(max(dirtVariation, 0.0)) * dirtReveal * (0.022 + min(baseLuminance, 0.8) * 0.055);
        opticalColor += vec3(0.956) * dirtHalo * dirtMask * 0.14;

        float grain = astraHash(floor(uv * vec2(1536.0, 1024.0)));
        opticalColor += vec3((grain - 0.5) * uGrain) * (0.18 + reveal * 0.82) * uDirtyGlassEnabled;

        vec3 darkMapped = ACESFilmicToneMapping(max(opticalColor, vec3(0.0)));

        // =====================================================================
        // HYPER-DETAILED VOLUMETRIC SKY ENGINE (4 MOVING CLOUD LAYERS + GOD RAYS)
        // =====================================================================
        vec2 aspectUv = (uv - vec2(0.5, 0.5)) * vec2(max(uAspect, 1.0), 1.0);
        float centerDist = length(aspectUv);
        float logoPocket = (1.0 - smoothstep(0.06, 0.56, centerDist)) * clamp(1.0 - uScrollProgress * 1.5, 0.0, 1.0) * uShowLogo;

        // 1. Multi-Band Rayleigh + Mie Stratospheric Sky Dome
        vec3 skyCosmos  = vec3(0.018, 0.065, 0.210); // Deep stratospheric sapphire-indigo zenith
        vec3 skyUpper   = vec3(0.048, 0.145, 0.380); // Royal cerulean upper sky
        vec3 skyMid     = vec3(0.095, 0.245, 0.520); // Vibrant azure mid-sky
        vec3 skyHorizon = vec3(0.280, 0.455, 0.700); // Luminous opalescent Mie horizon
        vec3 skyWarmth  = vec3(0.420, 0.360, 0.480); // Subtle warm golden-violet horizon scatter

        float y1 = smoothstep(0.0, 0.38, uv.y);
        float y2 = smoothstep(0.28, 0.72, uv.y);
        float y3 = smoothstep(0.60, 1.0, uv.y);
        vec3 sky = mix(skyHorizon, skyMid, y1);
        sky = mix(sky, skyUpper, y2);
        sky = mix(sky, skyCosmos, y3);
        sky += skyWarmth * pow(clamp(1.0 - uv.y, 0.0, 1.0), 3.2) * 0.22;

        // Celestial Sun Position & Mie Solar Corona
        vec2 sunPos = vec2(-0.52 * max(uAspect, 1.0), 0.38);
        vec2 toSun = sunPos - aspectUv;
        float sunDist = length(toSun);
        vec2 sunDir = normalize(vec2(-0.68, 0.73));
        sky += vec3(0.22, 0.27, 0.35) * exp(-sunDist * 1.85);
        sky += vec3(0.35, 0.32, 0.26) * exp(-sunDist * 5.5);

        // 3D Camera Spin + Scroll Flight Parallax
        vec2 camShift = uDirtTextureOffset * 6.5 + vec2(0.0, -uScrollProgress * 0.55);
        float persp = 1.0 / (0.46 + uv.y * 0.72);
        vec2 cloudP = vec2(aspectUv.x * persp * 1.65, (uv.y - 0.48) * persp * 2.15) + camShift;

        // LAYER A: High-Altitude Sheared Jetstream Cirrus (gliding diagonally across upper sky)
        vec2 cirrusCoord = vec2(cloudP.x * 1.4 + cloudP.y * 0.6, cloudP.y * 2.4 - cloudP.x * 0.3) + vec2(4.2, -1.9);
        float cirrusWave = warpFbm(cirrusCoord * 1.35, vec2(uTime * 0.055, uTime * 0.018));
        float cirrusFine = skyNoise(cirrusCoord * 5.5 + vec2(uTime * 0.11, -uTime * 0.04));
        float cirrusMask = smoothstep(0.50, 0.80, cirrusWave * 0.82 + cirrusFine * 0.18)
                         * smoothstep(0.18, 0.88, uv.y) * 0.42;
        cirrusMask *= mix(1.0, 0.68, logoPocket);
        vec3 cirrusCol = mix(vec3(0.38, 0.52, 0.74), vec3(0.75, 0.83, 0.94), exp(-sunDist * 1.4));
        sky = mix(sky, cirrusCol, cirrusMask);

        // LAYER B: Volumetric Crepuscular God-Rays (Sunbeams dynamically occluded by moving clouds!)
        float godRayAccum = 0.0;
        vec2 rayStep = toSun * 0.14;
        vec2 raySamplePos = aspectUv;
        for (int r = 0; r < 5; r++) {
          raySamplePos += rayStep;
          vec2 rCloudP = raySamplePos * 1.55 + camShift * 0.8;
          float rOcc = warpFbm(rCloudP * 1.15 + vec2(2.3, 4.7), vec2(uTime * 0.075, uTime * 0.018));
          godRayAccum += 1.0 - smoothstep(0.38, 0.62, rOcc);
        }
        godRayAccum = (godRayAccum / 5.0) * exp(-sunDist * 1.35) * smoothstep(0.05, 0.85, uv.y);
        sky += vec3(0.20, 0.25, 0.34) * godRayAccum * 0.68;

        // LAYER C: Towering Domain-Warped Cumulus Clouds (visibly rolling & morphing, soft airy shading!)
        float skyWindow = mix(0.68, 1.12, smoothstep(0.10, 0.66, centerDist));
        float horizonArch = mix(1.10, 0.90, smoothstep(0.0, 0.68, uv.y));
        vec2 cumCoord = cloudP * 1.18 + vec2(2.3, 4.7);

        float rawShape = cumulusFbm(cumCoord, uTime, 0.078);
        float detail   = warpFbm(cumCoord * 2.95 + vec2(11.2, -7.4), vec2(uTime * 0.135, -uTime * 0.045));
        float sculpted = (rawShape * 0.76 + detail * 0.24) * skyWindow * horizonArch;
        float cloudDensity = smoothstep(0.45, 0.75, sculpted);
        cloudDensity *= mix(1.0, 0.55, logoPocket);

        // Consistent directional derivative along sunDir (no mismatched function blotches, high ambient floor)
        float s1 = cumulusFbm(cumCoord + sunDir * 0.075, uTime, 0.078);
        float s2 = cumulusFbm(cumCoord + sunDir * 0.180, uTime, 0.078);

        float opticalDepth = max(0.0, s1 - rawShape) * 1.85
                           + max(0.0, s2 - rawShape) * 1.10;
        float transmittance = exp(-opticalDepth * 1.45);
        float powder = 1.0 - exp(-cloudDensity * 2.8);
        float directLight = clamp(0.48 + transmittance * (0.32 + 0.35 * powder) + (uv.y - 0.25) * 0.10, 0.0, 1.0);

        // Soft anisotropic silver-pearl rim scattering
        float rimLight = pow(clamp(1.0 - cloudDensity * 0.80, 0.0, 1.0), 2.0)
                       * smoothstep(0.43, 0.64, sculpted)
                       * transmittance;

        // Cloud bases stay airy and sky-lit (never darker than the sky, zero dark stormy blotches!)
        vec3 cloudSoftBase   = max(sky * 0.96, vec3(0.240, 0.390, 0.630));
        vec3 cloudMidAmbient = max(sky * 1.08, vec3(0.420, 0.560, 0.760));
        vec3 cloudWarmRim    = vec3(0.650, 0.745, 0.875);
        vec3 cloudSunCrown   = vec3(0.840, 0.895, 0.968);

        vec3 cloudCol = mix(cloudSoftBase, cloudMidAmbient, smoothstep(0.25, 0.58, directLight));
        cloudCol = mix(cloudCol, cloudWarmRim, smoothstep(0.50, 0.78, directLight));
        cloudCol = mix(cloudCol, cloudSunCrown, smoothstep(0.70, 0.98, directLight));
        cloudCol += vec3(0.20, 0.23, 0.28) * rimLight;

        // LAYER D: Fast Foreground Cloud Wisps (high-speed parallax, soft luminous shading matching top clouds!)
        vec2 fgCoord = (aspectUv * vec2(1.35, 2.35) + camShift * 1.55) + vec2(-4.1, 6.8);
        float fgRaw = cumulusFbm(fgCoord, uTime, 0.135);
        float fgMask = smoothstep(0.48, 0.78, fgRaw * mix(0.72, 1.08, smoothstep(0.14, 0.66, centerDist)))
                     * (1.0 - smoothstep(0.02, 0.86, uv.y));
        fgMask *= mix(1.0, 0.40, logoPocket);
        float fgSun = cumulusFbm(fgCoord + sunDir * 0.085, uTime, 0.135);
        float fgLit = clamp(0.52 + 0.48 * exp(-max(0.0, fgSun - fgRaw) * 2.2), 0.0, 1.0);
        vec3 fgSoftShadow = max(sky * 0.98, vec3(0.280, 0.440, 0.680));
        vec3 fgCol = mix(fgSoftShadow, vec3(0.82, 0.88, 0.96), smoothstep(0.35, 0.92, fgLit));

        vec3 skyWithClouds = mix(sky, cloudCol, cloudDensity * 0.88);
        skyWithClouds = mix(skyWithClouds, fgCol, fgMask * 0.68);

        // 3. Dynamic 3D Subsurface Cloud Illumination from the Argon Neon Ribbon Bloom
        float cloudPresence = max(cloudDensity, fgMask);
        vec3 cloudBounce = bloom * (0.48 + 0.92 * cloudPresence) * uShowLogo;
        vec3 litSky = skyWithClouds + cloudBounce * 0.65;

        // 4. Exact Night-Mode ACES Filmic Star & Nebula Compositing (100% monotonic, zero rings!)
        float dmPeak = max(darkMapped.r, max(darkMapped.g, darkMapped.b));
        vec3 baseCanvas = clamp(litSky, 0.0, 1.0) * (1.0 - dmPeak * 0.45);
        vec3 lightSkyComp = 1.0 - (1.0 - baseCanvas) * (1.0 - darkMapped);

        // Seamless real-time blend between Dark Night (0.0) and Volumetric Sky Mode (1.0)
        vec3 finalColor = mix(darkMapped, lightSkyComp, uTheme);
        gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
        #endif
      }
    `;

    // =========================================================================
    // 6. MATRIX4 HELPERS (ORTHOGRAPHIC CAMERA & SCENE HIERARCHY)
    // =========================================================================
    function mat4Identity() {
      return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }

    function mat4Multiply(out, a, b) {
      const a00=a[0], a01=a[1], a02=a[2], a03=a[3];
      const a10=a[4], a11=a[5], a12=a[6], a13=a[7];
      const a20=a[8], a21=a[9], a22=a[10], a23=a[11];
      const a30=a[12], a31=a[13], a32=a[14], a33=a[15];
      for (let i = 0; i < 4; i++) {
        const b0 = b[4*i], b1 = b[4*i+1], b2 = b[4*i+2], b3 = b[4*i+3];
        out[4*i]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[4*i+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[4*i+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[4*i+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      }
      return out;
    }

    // Compose Matrix4 from translation (tx, ty, tz), Euler XYZ (rx, ry, rz), and uniform scale s
    function mat4ComposeEulerXYZ(out, tx, ty, tz, rx, ry, rz, s = 1) {
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);
      const ce = cx * cz, cs = cx * sz, se = sx * cz, ss = sx * sz;
      out[0]  = (cy * cz) * s;
      out[4]  = (se * sy - cs) * s;
      out[8]  = (ce * sy + ss) * s;
      out[12] = tx;
      out[1]  = (cy * sz) * s;
      out[5]  = (ss * sy + ce) * s;
      out[9]  = (cs * sy - se) * s;
      out[13] = ty;
      out[2]  = (-sy) * s;
      out[6]  = (sx * cy) * s;
      out[10] = (cx * cy) * s;
      out[14] = tz;
      out[3]  = 0; out[7] = 0; out[11] = 0; out[15] = 1;
      return out;
    }

    function transformPointMat4(out, p, m) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3]*x + m[7]*y + m[11]*z + m[15] || 1;
      out[0] = (m[0]*x + m[4]*y + m[8]*z + m[12]) / w;
      out[1] = (m[1]*x + m[5]*y + m[9]*z + m[13]) / w;
      out[2] = (m[2]*x + m[6]*y + m[10]*z + m[14]) / w;
      return out;
    }

    function applyEulerXYZ(p, rx, ry, rz) {
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);
      let x = p[0], y = p[1], z = p[2];
      // X
      let y1 = y * cx - z * sx;
      let z1 = y * sx + z * cx;
      // Y
      let x2 = x * cy + z1 * sy;
      let z2 = -x * sy + z1 * cy;
      // Z
      p[0] = x2 * cz - y1 * sz;
      p[1] = x2 * sz + y1 * cz;
      p[2] = z2;
      return p;
    }

    function applyEulerYXZ(p, rx, ry) {
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      let x = p[0], y = p[1], z = p[2];
      // X first then Y (matching shader lines 719-734)
      const y1 = y * cx - z * sx;
      const z1 = y * sx + z * cx;
      p[0] = x * cy + z1 * sy;
      p[1] = y1;
      p[2] = -x * sy + z1 * cy;
      return p;
    }

    // =========================================================================
    // 7. WEBGL INITIALIZATION & FIELD GENERATION
    // =========================================================================
    const canvas = document.getElementById("astra-canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: !isLightQuality,
      depth: false,
      stencil: false,
      powerPreference: isLightQuality ? "low-power" : "high-performance"
    }) || canvas.getContext("webgl", {
      alpha: false,
      antialias: !isLightQuality,
      depth: false,
      stencil: false
    });

    if (!gl) return;
    const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    if (isWebGL2) {
      gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");
    } else {
      gl.getExtension("OES_texture_float");
      gl.getExtension("OES_texture_half_float");
      gl.getExtension("OES_texture_half_float_linear");
      gl.getExtension("WEBGL_color_buffer_float");
    }

    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s), src);
      }
      return s;
    }

    function createProgram(vsSrc, fsSrc) {
      const p = gl.createProgram();
      gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(p));
      }
      return p;
    }

    const starProg = createProgram(GLSL_STAR_VERTEX, GLSL_STAR_FRAGMENT);
    const simProg  = createProgram("#define ASTRA_PARTICLE_SIMULATION 1\n" + GLSL_STAR_VERTEX, GLSL_SIM_FRAGMENT);
    const threshProg = createProgram(GLSL_QUAD_VERTEX, GLSL_BLOOM_THRESHOLD_FRAG);
    const blurProg   = createProgram(GLSL_QUAD_VERTEX, GLSL_BLOOM_BLUR_FRAG);
    const compProg   = createProgram(GLSL_COMPOSITE_VERTEX,
      (isLightQuality ? "#define ASTRA_LIGHT_QUALITY 1\n" : "") + GLSL_COMPOSITE_FRAGMENT);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    function createFloatDataTexture(data, width, height) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (isWebGL2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
      }
      return tex;
    }

    function createLightCloudTexture() {
      const size = 256;
      const makeField = (baseW, baseH, seed) => {
        const octaves = [];
        for (let octave = 0; octave < 4; octave++) {
          const width = baseW * (1 << octave);
          const height = baseH * (1 << octave);
          const values = new Float32Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const hash = Math.sin(x * 127.1 + y * 311.7 + seed + octave * 53.7) * 43758.5453;
              values[y * width + x] = hash - Math.floor(hash);
            }
          }
          octaves.push({ width, height, values });
        }
        return octaves;
      };
      const fields = [makeField(3, 2, 19.7), makeField(6, 4, 47.3), makeField(12, 7, 83.1)];
      const sampleField = (field, u, v) => {
        let total = 0;
        let amplitude = 0.55;
        let amplitudeTotal = 0;
        for (const octave of field) {
          const x = u * octave.width;
          const y = v * octave.height;
          const x0 = Math.floor(x), y0 = Math.floor(y);
          const x1 = (x0 + 1) % octave.width, y1 = (y0 + 1) % octave.height;
          const tx0 = x - x0, ty0 = y - y0;
          const tx = tx0 * tx0 * tx0 * (tx0 * (tx0 * 6 - 15) + 10);
          const ty = ty0 * ty0 * ty0 * (ty0 * (ty0 * 6 - 15) + 10);
          // Keep the generated cloud field seamless even when domain warping
          // pushes a sample left of zero. JS remainder stays negative there;
          // normalize it before indexing so the texture never gets NaN bands.
          const wrap = (value, size) => ((value % size) + size) % size;
          const at = (ix, iy) => octave.values[wrap(iy, octave.height) * octave.width + wrap(ix, octave.width)];
          const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
          const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
          total += (top + (bottom - top) * ty) * amplitude;
          amplitudeTotal += amplitude;
          amplitude *= 0.5;
        }
        return total / amplitudeTotal;
      };

      const data = new Uint8Array(size * size * 4);
      const billow = (value) => 1 - Math.abs(value * 2 - 1);
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const offset = (y * size + x) * 4;
          const warpX = sampleField(fields[1], u + 0.19, v + 0.31);
          const warpY = sampleField(fields[1], u + 0.53, v + 0.71);
          const warpedU = u + (warpX - 0.5) * 0.12;
          const warpedV = v + (warpY - 0.5) * 0.16;
          const broad = sampleField(fields[0], warpedU, warpedV);
          // Every octave and the warp must repeat after exactly one UV tile.
          // Fractional scales (1.35 / 1.7) broke that period, producing visible
          // horizontal and vertical cuts whenever the GPU repeated the texture.
          const middle = sampleField(fields[1], warpedU + 0.17, warpedV + 0.11);
          const fine = sampleField(fields[2], warpedU + 0.37, warpedV + 0.13);
          const broadBillow = broad * 0.52 + Math.pow(billow(broad), 2) * 0.48;
          const middleBillow = middle * 0.62 + Math.pow(billow(middle), 2) * 0.38;
          const fineBillow = fine * 0.70 + Math.pow(billow(fine), 2) * 0.30;
          data[offset] = Math.round(broadBillow * 255);
          data[offset + 1] = Math.round(middleBillow * 255);
          data[offset + 2] = Math.round(fineBillow * 255);
          data[offset + 3] = 255;
        }
      }

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return texture;
    }

    // Procedural lens dirt texture
    const dirtData = generateProceduralLensDirt(256, 192, 0xa57ad175);
    const dirtTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, dirtTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 192, 0, gl.RGBA, gl.UNSIGNED_BYTE, dirtData);
    const lightCloudTexture = isLightQuality ? createLightCloudTexture() : dirtTexture;

    // Pre-sample morph shapes (Cursor & OpenAI Knot)
    const SHAPE_LIBRARY = {
      cursor: sampleSvgShapePaths([ASTRA_CURSOR_PATH], 19, 19),
      "openai-knot": sampleSvgShapePaths(ASTRA_OPENAI_KNOT_PATHS, 1726, 1538)
    };
    const pathShapeTexture = createFloatDataTexture(SHAPE_LIBRARY.cursor.samples, 1024, 1);

    function updatePathShapeTexture(samples) {
      gl.bindTexture(gl.TEXTURE_2D, pathShapeTexture);
      if (isWebGL2) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, 1, gl.RGBA, gl.FLOAT, samples);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1, 0, gl.RGBA, gl.FLOAT, samples);
      }
    }

    // Generate Astra / Argon Logo star field
    function buildAstraField(paletteName = CONFIG.colorPalette, shapeMode = CONFIG.shapeMode) {
      const isLogo = shapeMode === "logo";
      const defs = isLogo ? LOGO_ORBIT_DEFS : ORBIT_DEFS;
      const paths = isLogo ? LOGO_SVG_PATHS : SIX_SVG_PATHS;
      const density = CONFIG.stars.density;
      const counts = defs.map(def => Math.max(8, Math.round((def.countBase ?? (def.strong ? 220 : 170)) * density)));
      const bgCounts = counts.map(c => Math.ceil(0.12 * c / 0.88));
      const coreCount = Math.max(18, Math.round((isLogo ? 36 : 24) * density));

      const pathLayers = [];
      let totalParticles = 0;
      for (let i = 0; i < defs.length; i++) {
        totalParticles += counts[i] + bgCounts[i];
      }
      totalParticles += coreCount;
      const simRows = Math.max(1, Math.ceil(totalParticles / 128));
      let globalParticleOffset = 0;

      for (let o = 0; o < defs.length; o++) {
        const def = defs[o];
        const fgCount = counts[o];
        const bgCount = bgCounts[o];
        const m = fgCount + bgCount;
        const ribbonId = def.ribbonId ?? 0;
        const ribGrad = LOGO_RIBBON_GRADIENTS[ribbonId] || LOGO_RIBBON_GRADIENTS[0];
        const customRibbonHex = (isLogo && paletteName === "argon") ? ribGrad.accents : null;
        const ribbonColorStart = hexToLinearRgb(ribGrad.start, [1, 1, 1]);
        const ribbonColorMid   = hexToLinearRgb(ribGrad.mid,   [1, 1, 1]);
        const ribbonColorEnd   = hexToLinearRgb(ribGrad.end,   [1, 1, 1]);

        const curve2D = new CurvePath2D(paths[o]);
        const curve3D = new AstraSpiralCurve3D(curve2D, def.depth, CONFIG.rotationDepth, 0.82 * o);

        const p0 = curve3D.getPointAt(0, [0, 0, 0]);
        const p1 = curve3D.getPointAt(1, [0, 0, 0]);
        const r0 = p0[0]*p0[0] + p0[1]*p0[1] + p0[2]*p0[2];
        const r1 = p1[0]*p1[0] + p1[1]*p1[1] + p1[2]*p1[2];
        const endsCloserToCenter = r1 < r0;
        const speed = isLogo
          ? def.speed * (CONFIG.stars.flowInward ? 1 : -1)
          : Math.abs(def.speed) * ((CONFIG.stars.flowInward ? endsCloserToCenter : !endsCloserToCenter) ? 1 : -1);

        // 512 path samples
        const pathSamples = new Float32Array(2048);
        const pt = [0, 0, 0];
        for (let e = 0; e < 512; e++) {
          curve3D.getPointAt(e / 511, pt);
          const idx = 4 * e;
          pathSamples[idx] = pt[0];
          pathSamples[idx + 1] = pt[1];
          pathSamples[idx + 2] = pt[2];
          pathSamples[idx + 3] = 1;
        }
        const pathTexture = createFloatDataTexture(pathSamples, 512, 1);

        const posArr = new Float32Array(3 * m);
        const acrossArr = new Float32Array(m);
        const brightArr = new Float32Array(m);
        const colorArr = new Float32Array(3 * m);
        const depthArr = new Float32Array(m);
        const heroArr = new Float32Array(m);
        const bgArr = new Float32Array(m);
        bgArr.fill(1, fgCount);
        const opacityArr = new Float32Array(m);
        const orbitArr = new Float32Array(m);
        const scaleArr = new Float32Array(m);
        const twinklePhaseArr = new Float32Array(m);
        const twinkleRateArr = new Float32Array(m);
        const motionUvArr = new Float32Array(3 * m);

        const rngO = mulberry32(0x243f6a88 ^ Math.imul(o + 1, 0x9e3779b9));
        const rngI = mulberry32(0xa4093822 ^ Math.imul(o + 1, 0x299f31d0));
        const z = [0, 0, 0], tan = [0, 0, 0], norm = [0, 0, 0];

        let maxHeroScale = -Infinity;
        let heroIdx = 0;
        let flareAcross = 0, flareDepth = 0, flareProg = 0.5;
        let flarePos = [0, 0, 0];
        const baseScatter = def.scatterScale ?? CONFIG.stars.scatter;

        for (let idx = 0; idx < m; idx++) {
          const i = rngO();
          const s = isLogo ? lerp(i, densityProgress(i, CONFIG.stars.densityFalloff), 0.35) : densityProgress(i, CONFIG.stars.densityFalloff);
          const n = isLogo ? lerp(0.75, 1.0, middleWeightFn(s)) : middleWeightFn(s);
          curve3D.getPointAt(s, z);
          curve3D.getTangentAt(s, tan);
          const nLen = Math.hypot(-tan[1], tan[0]) || 1;
          norm[0] = -tan[1] / nLen;
          norm[1] = tan[0] / nLen;
          norm[2] = 0;

          const u = baseScatter * lerp(0.3, 1, n) * (0.22 + 0.78 * rngO());
          const d = (rngO() + rngO() - 1) * u;
          const dp = (rngO() + rngO() - 1) * u * 0.65;
          z[0] += norm[0] * d;
          z[1] += norm[1] * d;
          z[2] += dp;

          const wThresh = lerp((def.strong ? 0.085 : 0.055) * 0.22, def.strong ? 0.085 : 0.055, n);
          const isBright = rngO() < wThresh;
          const sc = (isBright ? 0.85 + 1.25 * rngO() : 0.12 + Math.pow(rngO(), 2.4) * 0.68) * CONFIG.stars.size;
          const br = (isBright ? 2 + 1.5 * rngO() : 0.56 + 0.78 * rngO()) * (def.strong ? 1 : 0.82);

          const p3 = 3 * idx;
          posArr[p3] = z[0]; posArr[p3 + 1] = z[1]; posArr[p3 + 2] = z[2];
          acrossArr[idx] = d;
          brightArr[idx] = br;
          writeStarColor(colorArr, p3, CONFIG.colorMode, rngI(), paletteName, customRibbonHex);
          depthArr[idx] = dp;
          opacityArr[idx] = 0.84 + 0.15 * rngO();
          orbitArr[idx] = i;
          scaleArr[idx] = sc;
          twinklePhaseArr[idx] = rngO() * Math.PI * 2;
          twinkleRateArr[idx] = 0.65 + 0.7 * rngO();

          if (idx < fgCount && sc > maxHeroScale) {
            maxHeroScale = sc;
            flareAcross = d;
            flareDepth = dp;
            flareProg = i;
            heroIdx = idx;
            flarePos = [z[0], z[1], z[2]];
          }
        }

        const heroMinScale = (def.strong ? 2.2 : 2.05) * CONFIG.stars.size;
        scaleArr[heroIdx] = Math.max(scaleArr[heroIdx], heroMinScale);
        brightArr[heroIdx] = Math.max(brightArr[heroIdx], def.strong ? 3.35 : 2.85);
        heroArr[heroIdx] = 1;
        writeStarColor(colorArr, 3 * heroIdx, CONFIG.colorMode, SECONDARY_COLOR_SEEDS[o % SECONDARY_COLOR_SEEDS.length] ?? 0.08, paletteName, customRibbonHex);

        for (let idx = 0; idx < m; idx++) {
          const p3 = 3 * idx;
          const gIdx = globalParticleOffset + idx;
          motionUvArr[p3]     = ((gIdx % 128) + 0.5) / 128;
          motionUvArr[p3 + 1] = (Math.floor(gIdx / 128) + 0.5) / simRows;
          motionUvArr[p3 + 2] = particleMotionMass(0.35 + 3.8 * scaleArr[idx]);
        }
        const heroMotionUv = [
          motionUvArr[3 * heroIdx],
          motionUvArr[3 * heroIdx + 1],
          motionUvArr[3 * heroIdx + 2]
        ];
        globalParticleOffset += m;

        const qOrbit = orbitArr[heroIdx] ?? 0;
        const qTwinkle = twinklePhaseArr[heroIdx] ?? 0;
        const qScale = scaleArr[heroIdx] ?? 0;
        const qBright = brightArr[heroIdx] ?? 0;
        const qOpac = opacityArr[heroIdx] ?? 0;
        const qRate = twinkleRateArr[heroIdx] ?? 0;

        const shapeSeed = Math.fround(positiveModulo(qOrbit * 0.754877666 + qTwinkle * 0.159154943 + qScale * 0.117, 1));
        const scX = fractSinHash(qOrbit, qTwinkle, 127.1, 311.7);
        const scY = fractSinHash(qTwinkle, qScale, 269.5, 183.3);
        const scZ = fractSinHash(qOrbit, qBright, 419.2, 371.9);
        const clrSeed = fractSinHash(qOpac, qRate, 157.3, 283.9);
        const acrossSc = Math.fround((scX + scY - 1) * 0.12);
        const depthSc = Math.fround((scZ - 0.5) * 0.22);

        pathLayers.push({
          isCore: false,
          count: m,
          strong: def.strong,
          speed,
          phase: def.phase,
          travel: def.phase,
          motionOffset: 0,
          pathShapeTravel: 0,
          pathShapeDepth: def.depth * CONFIG.rotationDepth,
          pathShapeDepthPhase: 0.82 * o,
          pathTexture,
          flarePathSamples: pathSamples,
          flareBasePosition: flarePos,
          flareAcrossOffset: flareAcross,
          flareDepthOffset: flareDepth,
          flareProgress: flareProg,
          flareScatter: [scX, scY, scZ],
          flareClearanceSeed: clrSeed,
          flareShapeSeed: shapeSeed,
          flareShapeAcrossScatter: acrossSc,
          flareShapeDepthScatter: depthSc,
          flareWorldPos: [0, 0, 0],
          flareScale: 1,
          heroMotionUv,
          lag: isLogo ? (0.18 + 0.15 * (o % 5) + 0.06 * ribbonId) : (0.18 + 0.17 * o),
          spin: [0, 0],
          seamEnvelope: isLogo ? 1.0 : 0.0,
          useRibbonGradient: (isLogo && paletteName === "argon") ? 1.0 : 0.0,
          ribbonColorStart,
          ribbonColorMid,
          ribbonColorEnd,
          buffers: createLayerBuffers({
            posArr, orbitArr, acrossArr, depthArr, heroArr, bgArr,
            brightArr, colorArr, opacityArr, scaleArr, twinklePhaseArr, twinkleRateArr, motionUvArr
          })
        });
      }

      // Core cluster (for Logo mode: anchored at the 4 structural nexuses of the Argon "A" so the inner triangular window stays crisp and open)
      {
        const a = coreCount;
        const posArr = new Float32Array(3 * a);
        const orbitArr = new Float32Array(a);
        const acrossArr = new Float32Array(a);
        const depthArr = new Float32Array(a);
        const heroArr = new Float32Array(a);
        const bgArr = new Float32Array(a);
        const brightArr = new Float32Array(a);
        const colorArr = new Float32Array(3 * a);
        const opacityArr = new Float32Array(a);
        const scaleArr = new Float32Array(a);
        const twinklePhaseArr = new Float32Array(a);
        const twinkleRateArr = new Float32Array(a);
        const motionUvArr = new Float32Array(3 * a);

        const rngP = mulberry32(0xb7e15162);
        const rngG = mulberry32(0xc0ac29b7);
        let heroIdx = 0, maxScore = -Infinity;

        const logoNexuses = [
          // 0: Center Chevron Arch Peak (Primary Optical Flare Anchor)
          { x:  0.00, y:  0.08, rad: 0.48, hexes: ["#008496", "#009E92", "#00B68A", "#00DE80", "#5EF4AC"] },
          // 1: Top Apex Seam (Coral-Red meets Amber-Gold)
          { x:  0.02, y:  4.95, rad: 0.46, hexes: ["#D82666", "#FF2E4E", "#FF647E", "#FF9A10", "#FFCC1C"] },
          // 2: Bottom-Left Lobe Seam (Purple-Magenta meets Deep Teal)
          { x: -3.12, y: -2.28, rad: 0.42, hexes: ["#8E2488", "#B42678", "#D82666", "#008496", "#009E92"] },
          // 3: Bottom-Right Lobe Seam (Lemon-Gold meets Mint-Green)
          { x:  3.12, y: -2.28, rad: 0.42, hexes: ["#FFCC1C", "#FFE830", "#00B68A", "#00DE80", "#5EF4AC"] }
        ];

        for (let t = 0; t < a; t++) {
          const p3 = 3 * t;
          let w = 0.5;
          let customHex = null;
          let isPrimaryNexus = true;

          if (isLogo) {
            const pick = rngP();
            const nxIdx = pick < 0.42 ? 0 : (pick < 0.74 ? 1 : (pick < 0.87 ? 2 : 3));
            const nx = logoNexuses[nxIdx];
            isPrimaryNexus = (nxIdx === 0);
            const rad = Math.pow(rngP(), 1.55) * nx.rad;
            const ang = rngP() * Math.PI * 2;
            posArr[p3]     = nx.x + Math.cos(ang) * rad;
            posArr[p3 + 1] = nx.y + Math.sin(ang) * rad * 0.82;
            posArr[p3 + 2] = (rngP() - 0.5) * 0.24;
            w = 1 - rad / nx.rad;
            if (paletteName === "argon") customHex = nx.hexes;
          } else {
            const rad = Math.pow(rngP(), 2.4) * 0.42;
            const ang = rngP() * Math.PI * 2;
            posArr[p3]     = Math.cos(ang) * rad;
            posArr[p3 + 1] = Math.sin(ang) * rad * 0.72;
            posArr[p3 + 2] = (rngP() - 0.5) * 0.16;
            w = 1 - rad / 0.42;
          }

          brightArr[t] = (isLogo ? 0.9 + 1.65 * w : 1.2 + 2.8 * w) + 0.55 * rngP();
          writeStarColor(colorArr, p3, CONFIG.colorMode, isLogo ? rngG() : (w > 0.74 ? 0.99 : rngG()), paletteName, customHex);
          opacityArr[t] = 0.62 + 0.36 * w;
          scaleArr[t] = (0.24 + (isLogo ? 1.05 : 1.45) * w + 0.4 * rngP()) * CONFIG.stars.size * 0.8;
          const score = brightArr[t] * scaleArr[t];
          if (isPrimaryNexus && score > maxScore) {
            maxScore = score;
            heroIdx = t;
          }
          twinklePhaseArr[t] = rngP() * Math.PI * 2;
          twinkleRateArr[t] = 0.55 + 0.45 * rngP();
        }
        if (isLogo) {
          brightArr[heroIdx] = Math.max(brightArr[heroIdx], 3.15);
          scaleArr[heroIdx] = Math.max(scaleArr[heroIdx], 1.85 * CONFIG.stars.size);
        }
        heroArr[heroIdx] = 1;

        for (let idx = 0; idx < a; idx++) {
          const p3 = 3 * idx;
          const gIdx = globalParticleOffset + idx;
          motionUvArr[p3]     = ((gIdx % 128) + 0.5) / 128;
          motionUvArr[p3 + 1] = (Math.floor(gIdx / 128) + 0.5) / simRows;
          motionUvArr[p3 + 2] = particleMotionMass(0.35 + 3.8 * scaleArr[idx]);
        }
        const heroMotionUv = [
          motionUvArr[3 * heroIdx],
          motionUvArr[3 * heroIdx + 1],
          motionUvArr[3 * heroIdx + 2]
        ];

        const qTwinkle = twinklePhaseArr[heroIdx] ?? 0;
        const qScale = scaleArr[heroIdx] ?? 0;
        const qBright = brightArr[heroIdx] ?? 0;
        const qOpac = opacityArr[heroIdx] ?? 0;
        const qRate = twinkleRateArr[heroIdx] ?? 0;

        const scX = fractSinHash(0, qTwinkle, 127.1, 311.7);
        const scY = fractSinHash(qTwinkle, qScale, 269.5, 183.3);
        const scZ = fractSinHash(0, qBright, 419.2, 371.9);
        const clrSeed = fractSinHash(qOpac, qRate, 157.3, 283.9);
        const shapeSeed = Math.fround(positiveModulo(qTwinkle * 0.159154943 + qScale * 0.117, 1));
        const acrossSc = Math.fround((scX + scY - 1) * 0.12);
        const depthSc = Math.fround((scZ - 0.5) * 0.22);

        pathLayers.push({
          isCore: true,
          count: a,
          strong: true,
          speed: 0,
          phase: 0,
          travel: 0,
          motionOffset: 0,
          pathShapeTravel: 0,
          pathShapeDepth: 0.18,
          pathShapeDepthPhase: 2.4,
          pathTexture: pathLayers[0].pathTexture,
          flarePathSamples: null,
          flareBasePosition: [posArr[3 * heroIdx], posArr[3 * heroIdx + 1], posArr[3 * heroIdx + 2]],
          flareAcrossOffset: 0,
          flareDepthOffset: 0,
          flareProgress: 0,
          flareScatter: [scX, scY, scZ],
          flareClearanceSeed: clrSeed,
          flareShapeSeed: shapeSeed,
          flareShapeAcrossScatter: acrossSc,
          flareShapeDepthScatter: depthSc,
          flareWorldPos: [0, 0, 0],
          flareScale: 1,
          heroMotionUv,
          lag: 0,
          spin: [0, 0],
          seamEnvelope: 0.0,
          useRibbonGradient: 0.0,
          ribbonColorStart: [1, 1, 1],
          ribbonColorMid: [1, 1, 1],
          ribbonColorEnd: [1, 1, 1],
          buffers: createLayerBuffers({
            posArr, orbitArr, acrossArr, depthArr, heroArr, bgArr,
            brightArr, colorArr, opacityArr, scaleArr, twinklePhaseArr, twinkleRateArr, motionUvArr
          })
        });
      }

      return {
        pathLayers,
        simRows,
        coreLayerIndex: pathLayers.length - 1,
        secondaryFlareIndices: isLogo ? [0, 2, 7, 11, 12] : [0, 1, 2, 3, 4]
      };
    }

    function createLayerBuffers(data) {
      const makeBuf = (arr) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        return b;
      };
      return {
        position: makeBuf(data.posArr),
        orbitProgress: makeBuf(data.orbitArr),
        starAcrossOffset: makeBuf(data.acrossArr),
        starDepthOffset: makeBuf(data.depthArr),
        starHero: makeBuf(data.heroArr),
        starBackground: makeBuf(data.bgArr),
        starBrightness: makeBuf(data.brightArr),
        starColor: makeBuf(data.colorArr),
        starOpacity: makeBuf(data.opacityArr),
        starScale: makeBuf(data.scaleArr),
        twinklePhase: makeBuf(data.twinklePhaseArr),
        twinkleRate: makeBuf(data.twinkleRateArr),
        particleMotionUv: makeBuf(data.motionUvArr)
      };
    }

    let field = buildAstraField(CONFIG.colorPalette, CONFIG.shapeMode);

    // =========================================================================
    // 8. FRAMEBUFFERS (HDR SCENE, BLOOM PYRAMID, PING-PONG PARTICLE SIM)
    // =========================================================================
    function createFBO(w, h, linear = true) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (isWebGL2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb, tex, width: w, height: h };
    }

    let simFront = createFBO(128, field.simRows, false);
    let simBack  = createFBO(128, field.simRows, false);
    let simInitialized = false;
    let simAge = PARTICLE_MOTION_SETTLE_SECONDS;
    let simEpoch = -1;

    function resetSim() {
      simInitialized = false;
      simAge = PARTICLE_MOTION_SETTLE_SECONDS;
    }

    function rebuildField(pal = CONFIG.colorPalette, shapeMode = CONFIG.shapeMode) {
      CONFIG.colorPalette = pal;
      CONFIG.shapeMode = shapeMode;
      field = buildAstraField(pal, shapeMode);
      simFront = createFBO(128, field.simRows, false);
      simBack  = createFBO(128, field.simRows, false);
      resetSim();
    }

    let sceneFBO = null;
    let bloomThreshFBO = null;
    let bloomHighH = null, bloomHighV = null;
    let bloomMidH  = null, bloomMidV  = null;
    let bloomLowH  = null, bloomLowV  = null;

    let vpWidth = 1, vpHeight = 1, pixelRatio = 1;
    const backdropEl = document.querySelector(".astra-backdrop");

    function disposeFBO(fbo) {
      if (!fbo) return;
      gl.deleteFramebuffer(fbo.fb);
      gl.deleteTexture(fbo.tex);
    }

    function resizeRenderer() {
      const bounds = backdropEl?.getBoundingClientRect();
      const rawW = Math.max(1, Math.round(bounds?.width || document.documentElement.clientWidth || window.innerWidth));
      const rawH = Math.max(1, Math.round(bounds?.height || document.documentElement.clientHeight || window.innerHeight));

      const w = rawW;
      const h = rawH;
      const pixelBudget = isLightQuality ? (lowPowerDevice ? 480000 : 1200000) : 2400000;
      const maxDpr = isLightQuality ? 1 : 1.5;
      const dpr = clamp(Math.min(window.devicePixelRatio || 1, Math.sqrt(pixelBudget / (w * h))), isLightQuality ? 0.25 : 0.5, maxDpr);
      const nextPixelRatio = Math.floor(100 * dpr) / 100;
      if (w === vpWidth && h === vpHeight && nextPixelRatio === pixelRatio) return;
      vpWidth = w;
      vpHeight = h;
      pixelRatio = nextPixelRatio;

      const drawW = Math.max(1, Math.floor(w * pixelRatio));
      const drawH = Math.max(1, Math.floor(h * pixelRatio));
      canvas.width = drawW;
      canvas.height = drawH;

      [sceneFBO, bloomThreshFBO, bloomHighH, bloomHighV, bloomMidH, bloomMidV, bloomLowH, bloomLowV].forEach(disposeFBO);
      sceneFBO = createFBO(drawW, drawH, true);
      const bloomScale = 0.5;
      const bW1 = Math.max(1, Math.round(drawW * bloomScale));
      const bH1 = Math.max(1, Math.round(drawH * bloomScale));
      const bW2 = Math.max(1, Math.round(bW1 * 0.5));
      const bH2 = Math.max(1, Math.round(bH1 * 0.5));
      const bW3 = Math.max(1, Math.round(bW2 * 0.5));
      const bH3 = Math.max(1, Math.round(bH2 * 0.5));

      bloomThreshFBO = createFBO(bW1, bH1, true);
      bloomHighH = createFBO(bW1, bH1, true);
      bloomHighV = createFBO(bW1, bH1, true);
      bloomMidH  = createFBO(bW2, bH2, true);
      bloomMidV  = createFBO(bW2, bH2, true);
      bloomLowH  = createFBO(bW3, bH3, true);
      bloomLowV  = createFBO(bW3, bH3, true);
      resetSim();
    }

    _addWinListener("resize", resizeRenderer, { passive: true });
    if (window.visualViewport) {
      _addDomListener(window.visualViewport, "resize", () => {
        // On mobile, ignore vertical-only resize from address bar scrolling
        const currentVpW = Math.round(window.visualViewport.width);
        if (Math.abs(currentVpW - vpWidth) > 30) {
          resizeRenderer();
        }
      }, { passive: true });
    }
    if (backdropEl && "ResizeObserver" in window) {
      _ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newW = Math.round(entry.contentRect.width);
          // Only trigger if width changed (orientation) or not mobile
          if (newW !== vpWidth) {
            resizeRenderer();
          }
        }
      });
      _ro.observe(backdropEl);
    }
    resizeRenderer();

    // =========================================================================
    // 9. ANIMATION STATE & INTERACTION (EXACT MATCH TO 3m0x6eidiggo3.js)
    // =========================================================================
    const state = {
      elapsed: 0,
      introElapsed: 0,
      introProgress: 0,
      coreTargetRotation: 0,
      coreRotation: 0,
      scrollProgress: 0,
      tiltProgress: 0,
      scatterScrollProgress: 0,
      scatterPositionProgress: 0,
      shapeProgress: 0,
      shapePositionProgress: 0,
      spinRotation: [0, 0],
      shapePointerRotation: [0, 0],
      shapeRotation: [0, 0],
      particleMotion: {
        pointer: [0, 0],
        previous: [0, 0],
        impulse: [0, 0],
        active: false,
        pressed: false,
        remaining: 0,
        epoch: 0
      },
      targetMode: "logo", // "logo", "six", "cursor", "openai-knot", "dispersed"
      themeTarget: 1,
      themeProgress: 1
    };

    const input = {
      returning: false,
      rotation: { x: 0, y: 0 },
      pointer: { active: false, pressed: false, reset: false, x: 0, y: 0 },
      shapeStrength: 0,
      shapeId: "cursor",
      dispersedStrength: 0
    };

    // Drag & Pointer handlers (exact match to module 675136 & 328679)
    const dragBtn = document.getElementById("astra-drag");
    let activeDrag = null;

    function updatePointerNdc(clientX, clientY, pressed) {
      if (isLightQuality) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      const ny = clamp(-(((clientY - rect.top) / rect.height) * 2 - 1), -1, 1);
      input.pointer.active = true;
      input.pointer.pressed = pressed;
      input.pointer.reset = false;
      input.pointer.x = nx;
      input.pointer.y = ny;
    }

    // Mobile touch particle movement: finger touch swirls & repels particles on phones just like mouse on PC
    let touchFadeTimer = null;
    function handleMobileTouch(e) {
      if (!e.touches || e.touches.length === 0) return;
      const t = e.touches[0];
      const targetTag = (t.target && t.target.tagName) || '';
      if (
        targetTag === 'INPUT' ||
        targetTag === 'BUTTON' ||
        targetTag === 'TEXTAREA' ||
        (t.target && t.target.closest && t.target.closest('.astra-login-form'))
      ) {
        return;
      }
      updatePointerNdc(t.clientX, t.clientY, false);
      if (touchFadeTimer) clearTimeout(touchFadeTimer);
    }

    if (!isLightQuality) {
      _addWinListener("touchstart", handleMobileTouch, { passive: true });
      _addWinListener("touchmove", handleMobileTouch, { passive: true });

      _addWinListener("touchend", () => {
        if (touchFadeTimer) clearTimeout(touchFadeTimer);
        touchFadeTimer = setTimeout(() => {
          input.pointer.active = false;
          input.pointer.reset = false;
        }, 450);
      }, { passive: true });

      _addWinListener("touchcancel", () => {
        if (touchFadeTimer) clearTimeout(touchFadeTimer);
        input.pointer.active = false;
        input.pointer.reset = true;
      }, { passive: true });

      _addWinListener("pointermove", (e) => {
        if (!e.isPrimary) return;
        if (e.pointerType === "touch" || e.pointerType === "pen") return;
        if (activeDrag && e.pointerId === activeDrag.id) {
          updatePointerNdc(e.clientX, e.clientY, true);
          const dx = (e.clientX - activeDrag.x) * 0.005;
          const dy = (e.clientY - activeDrag.y) * 0.005;
          const maxRot = 4 * Math.PI;
          input.rotation.y = clamp(input.rotation.y + dx, -maxRot, maxRot);
          input.rotation.x = clamp(input.rotation.x + dy, -maxRot, maxRot);
          input.returning = false;
          activeDrag.x = e.clientX;
          activeDrag.y = e.clientY;
        } else if (e.buttons === 0) {
          updatePointerNdc(e.clientX, e.clientY, false);
        }
      }, { passive: true });

      _addDomListener(dragBtn, "pointerdown", (e) => {
        // Bloquear giro con táctil 3D (optimización: solo permitido con mouse en PC)
        if (e.pointerType === "touch" || e.pointerType === "pen") return;
        const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
        if (isMobile) return;

        if (e.isPrimary && e.button === 0 && !activeDrag) {
          try { dragBtn.setPointerCapture(e.pointerId); } catch {}
          activeDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
          dragBtn.dataset.dragging = "true";
          updatePointerNdc(e.clientX, e.clientY, true);
        }
      });

    function endDrag(e) {
      if (activeDrag) {
        try { dragBtn.releasePointerCapture(activeDrag.id); } catch {}
        activeDrag = null;
        dragBtn.dataset.dragging = "false";
        if (e && e.pointerType === "mouse") {
          updatePointerNdc(e.clientX, e.clientY, false);
        } else {
          input.pointer.active = false;
          input.pointer.pressed = false;
        }
        if (CONFIG.faceForward) {
          input.rotation.x = 0;
          input.rotation.y = 0;
          input.returning = true;
        }
      }
    }

      _addDomListener(dragBtn, "pointerup", endDrag);
      _addDomListener(dragBtn, "pointercancel", endDrag);
      _addWinListener("blur", () => {
        endDrag();
        input.pointer.active = false;
        input.pointer.pressed = false;
        input.pointer.reset = true;
      });

      _addWinListener("keydown", (e) => {
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const map = {
          ArrowLeft:  { x: -0.08, y: 0 },
          ArrowRight: { x: 0.08, y: 0 },
          ...(e.shiftKey ? {
            ArrowDown: { x: 0, y: 0.08 },
            ArrowUp:   { x: 0, y: -0.08 }
          } : {})
        };
        const delta = map[e.key];
        if (delta) {
          e.preventDefault();
          const maxRot = 4 * Math.PI;
          input.rotation.y = clamp(input.rotation.y + delta.x, -maxRot, maxRot);
          input.rotation.x = clamp(input.rotation.x + delta.y, -maxRot, maxRot);
          input.returning = false;
        }
      });
    }

    _addWinListener("scroll", () => {
      if (state.targetMode === "dispersed") {
        state.targetMode = CONFIG.shapeMode;
      }
      if (state.targetMode === "logo" || state.targetMode === "six") {
        const sy = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
        const isDispersed = sy > Math.max(320, vpHeight * 0.55);
        const activeKey = isDispersed ? "dispersed" : CONFIG.shapeMode;
        document.querySelectorAll("[data-shape]").forEach(b => {
          b.dataset.active = String(b.dataset.shape === activeKey);
        });
      }
    }, { passive: true });

    // Helper functions for path sampling in JS (used for optical flare source tracking)
    function samplePathJS(samples, progress, out) {
      const count = Math.max(Math.floor(samples.length / 4), 1);
      const scaled = clamp(progress, 0, 1) * (count - 1);
      const lower = Math.floor(scaled);
      const upper = Math.min(lower + 1, count - 1);
      const blend = scaled - lower;
      const u = 4 * lower, c = 4 * upper;
      out[0] = lerp(samples[u] ?? 0, samples[c] ?? 0, blend);
      out[1] = lerp(samples[u + 1] ?? 0, samples[c + 1] ?? 0, blend);
      out[2] = lerp(samples[u + 2] ?? 0, samples[c + 2] ?? 0, blend);
      return out;
    }

    function samplePathRangeJS(samples, seed, out) {
      const count = Math.max(Math.floor(samples.length / 4), 1);
      const idx = 4 * Math.min(Math.floor(clamp(seed, 0, 0.999999) * count), count - 1);
      out[0] = samples[idx + 2] ?? 0;
      out[1] = samples[idx + 3] ?? 1;
      return out;
    }

    function applyAstraIntroMotionJS(pos, scattered, progress, seed, travelSeed) {
      if (progress >= 1) return;
      const s = 0.14 + 0.18 * seed;
      const l = smootherstep(progress, s, s + (0.58 + 0.1 * travelSeed));
      const n = lerp(l, Math.sin(l * Math.PI * 0.5), 0.5);
      const u = Math.sin(n * Math.PI) * (0.44 + 0.22 * seed);
      const c = Math.cos(u), h = Math.sin(u);
      pos[0] = lerp(scattered[0] * c - scattered[1] * h, pos[0], n);
      pos[1] = lerp(scattered[0] * h + scattered[1] * c, pos[1], n);
      pos[2] = lerp(scattered[2], pos[2], n);
    }

    function getAstraParticleRevealProgressJS(progress, seed) {
      const r = clamp(progress, 0, 1);
      const o = 0.015 * clamp(seed, 0, 1);
      return smoothstep(r, o, 0.14 + o) * lerp(0.2, 1, smoothstep(r, 0.2, 1));
    }

    function getAstraDispersedMotionOffsetJS(out, time, scX, scY, scZ, scrollDrift, strength) {
      const u = clamp(scZ, 0, 1);
      const c = clamp(strength, 0, 1);
      if (c === 0) { out[0] = 0; out[1] = 0; return out; }
      const h = lerp(0.4, 0.8, u);
      const p = lerp(0.035, 0.12, u) * c;
      const f = scX * Math.PI * 2 + 2.7 * scY;
      const d = scY * Math.PI * 2 + 3.1 * u;
      const m = scrollDrift * lerp(0.08, 0.28, u * u) * c;
      out[0] = (Math.sin(f + time * h) - Math.sin(f)) * p;
      out[1] = (Math.cos(d + time * h * 0.73) - Math.cos(d)) * p + m;
      return out;
    }

    // =========================================================================
    // 10. RENDER LOOP (SIMULATION + HDR STARS + BLOOM + LENS FLARE + COMPOSITE)
    // =========================================================================
    const viewMatrix = mat4Identity();
    const projMatrix = mat4Identity();
    const animRootMat = mat4Identity();
    const spinRootMat = mat4Identity();
    const bgModelMatrix = mat4Identity();
    const groupLocalMat = mat4Identity();
    const groupWorldMat = mat4Identity();
    const modelViewMat  = mat4Identity();
    const viewProjMat   = mat4Identity();

    // Locations never change after linking. Avoid thousands of driver queries
    // per frame across the fifteen particle ribbons.
    const uniformLocations = new WeakMap();
    const attributeLocations = new WeakMap();
    function uniformLocation(prog, name) {
      let cache = uniformLocations.get(prog);
      if (!cache) uniformLocations.set(prog, cache = new Map());
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
      return cache.get(name);
    }
    function attributeLocation(prog, name) {
      let cache = attributeLocations.get(prog);
      if (!cache) attributeLocations.set(prog, cache = new Map());
      if (!cache.has(name)) cache.set(name, gl.getAttribLocation(prog, name));
      return cache.get(name);
    }

    function bindStarAttributes(prog, buffers) {
      const attrs = [
        ["position", 3, buffers.position],
        ["orbitProgress", 1, buffers.orbitProgress],
        ["starAcrossOffset", 1, buffers.starAcrossOffset],
        ["starDepthOffset", 1, buffers.starDepthOffset],
        ["starHero", 1, buffers.starHero],
        ["starBackground", 1, buffers.starBackground],
        ["starBrightness", 1, buffers.starBrightness],
        ["starColor", 3, buffers.starColor],
        ["starOpacity", 1, buffers.starOpacity],
        ["starScale", 1, buffers.starScale],
        ["twinklePhase", 1, buffers.twinklePhase],
        ["twinkleRate", 1, buffers.twinkleRate],
        ["particleMotionUv", 3, buffers.particleMotionUv]
      ];
      for (const [name, size, buf] of attrs) {
        const loc = attributeLocation(prog, name);
        if (loc !== -1) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        }
      }
    }

    function setUniform1f(prog, name, v) {
      const l = uniformLocation(prog, name);
      if (l) gl.uniform1f(l, v);
    }
    function setUniform1i(prog, name, v) {
      const l = uniformLocation(prog, name);
      if (l) gl.uniform1i(l, v);
    }
    function setUniform2f(prog, name, x, y) {
      const l = uniformLocation(prog, name);
      if (l) gl.uniform2f(l, x, y);
    }
    function setUniform3f(prog, name, x, y, z) {
      const l = uniformLocation(prog, name);
      if (l) gl.uniform3f(l, x, y, z);
    }
    function setUniformMat4(prog, name, m) {
      const l = uniformLocation(prog, name);
      if (l) gl.uniformMatrix4fv(l, false, m);
    }

    function applyLayerUniforms(prog, layer, uState) {
      setUniformMat4(prog, "modelViewMatrix", layer.modelViewMat);
      setUniformMat4(prog, "projectionMatrix", projMatrix);
      setUniformMat4(prog, "viewMatrix", viewMatrix);
      setUniformMat4(prog, "uBackgroundModelMatrix", bgModelMatrix);

      setUniform1f(prog, "uIntensity", uState.intensity * (layer.isCore ? 1.22 : 1));
      setUniform1f(prog, "uIntroProgress", state.introProgress);
      setUniform1f(prog, "uBackgroundStarsEnabled", 1);
      setUniform1f(prog, "uAccretionRatio", CONFIG.accretionExhale.accretionRatio);
      setUniform1f(prog, "uAmbientPulse", 1);
      setUniform1f(prog, "uCoreIntensity", CONFIG.accretionExhale.coreIntensity);
      setUniform1f(prog, "uDensityFalloff", CONFIG.stars.densityFalloff);
      setUniform1f(prog, "uDispersedMotion", uState.dispersedMotion);
      setUniform1f(prog, "uFlowSpeed", CONFIG.stars.flowSpeed * uState.spiralPresence);
      setUniform1f(prog, "uExhaleStrength", CONFIG.accretionExhale.exhaleStrength);
      setUniform1f(prog, "uFormationEnabled", 0);
      setUniform1f(prog, "uFormationProgress", 1);
      setUniform1f(prog, "uGrowthEnabled", 0);
      setUniform1f(prog, "uGrowthDirection", layer.speed < 0 ? -1 : 1);
      setUniform1f(prog, "uGrowthProgress", 1);
      setUniform1f(prog, "uGrowthRadius", 8.2);
      setUniform1f(prog, "uGrowthSoftness", CONFIG.grow.softness);
      setUniform1f(prog, "uInwardStrength", CONFIG.accretionExhale.inwardStrength);
      setUniform1f(prog, "uLensActive", 0);
      setUniform1f(prog, "uLensDepth", CONFIG.interaction.depthDisplacement);
      setUniform1f(prog, "uLensIllumination", CONFIG.interaction.illumination);
      setUniform1f(prog, "uLensMagnification", CONFIG.interaction.magnification);
      setUniform2f(prog, "uLensPointer", 0, 0);
      setUniform1f(prog, "uLensRadius", 2 * CONFIG.interaction.radius / Math.max(vpHeight, 1));
      setUniform1f(prog, "uPointerRepelRadius", 2 * CONFIG.interaction.repelRadius / Math.max(vpHeight, 1));

      setUniform2f(prog, "uPathShapeCenter", uState.shapeCenter[0], uState.shapeCenter[1]);
      setUniform1f(prog, "uPathShapeBrightRetention", 0.5);
      setUniform1f(prog, "uPathShapeDepth", layer.pathShapeDepth);
      setUniform1f(prog, "uPathShapeDepthPhase", layer.pathShapeDepthPhase);
      setUniform1f(prog, "uPathShapeMotion", layer.pathShapeTravel);
      setUniform1f(prog, "uPathShapeProgress", state.shapeProgress);
      setUniform1f(prog, "uPathShapePositionProgress", state.shapePositionProgress);
      setUniform2f(prog, "uPathShapeRotation", state.shapeRotation[0], state.shapeRotation[1]);
      setUniform1f(prog, "uPathShapeScatter", CONFIG.pathShapeScatter);
      setUniform1f(prog, "uPathShapeSampleCount", 1024);
      setUniform2f(prog, "uPathShapeSize", uState.shapeSize[0], uState.shapeSize[1]);
      setUniform2f(prog, "uPathShapeTrackedScatter", layer.flareShapeAcrossScatter, layer.flareShapeDepthScatter);
      setUniform1f(prog, "uPathShapeTrackedSeed", layer.flareShapeSeed);
      setUniform1f(prog, "uPathShapeTrackingEnabled", 1);
      setUniform1f(prog, "uTrackedClearanceSeed", layer.flareClearanceSeed);
      setUniform3f(prog, "uTrackedScatter", layer.flareScatter[0], layer.flareScatter[1], layer.flareScatter[2]);

      setUniform2f(prog, "uScatterSize", uState.scatterSize[0], uState.scatterSize[1]);
      setUniform1f(prog, "uScrollDrift", uState.scrollDrift);
      setUniform1f(prog, "uScrollScatter", uState.scrollScatter);
      setUniform1f(prog, "uScrollPositionProgress", state.scatterPositionProgress);
      setUniform1f(prog, "uScrollSizeScale", uState.scrollSizeScale);
      setUniform1f(prog, "uSpiralTilt", uState.spiralTilt);
      setUniform2f(prog, "uTextBounds", uState.textBounds[0], uState.textBounds[1]);

      setUniform1f(prog, "uPathMotion", layer.isCore ? 0 : 1);
      setUniform1f(prog, "uPathOffset", layer.motionOffset);
      setUniform1f(prog, "uPathSampleCount", 512);
      setUniform1f(prog, "uPathSpeed", layer.speed);
      setUniform1f(prog, "uPixelRatio", pixelRatio);
      setUniform1f(prog, "uSizeFalloff", CONFIG.stars.sizeFalloff);
      setUniform1f(prog, "uPropagationSoftness", CONFIG.accretionExhale.propagationSoftness);
      setUniform1f(prog, "uSettleRatio", CONFIG.accretionExhale.settleDuration / CONFIG.convergeDuration);
      setUniform1f(prog, "uTime", state.elapsed);
      setUniform1f(prog, "uTwinkleSpeed", CONFIG.stars.twinkleSpeed * uState.spiralPresence);
      setUniform1f(prog, "uViewportAspect", vpWidth / Math.max(vpHeight, 1));
      setUniform1f(prog, "uTheme", state.themeProgress);

      setUniform1f(prog, "uSeamEnvelope", layer.seamEnvelope ?? 0);
      setUniform1f(prog, "uUseRibbonGradient", layer.useRibbonGradient ?? 0);
      setUniform3f(prog, "uRibbonColorStart", layer.ribbonColorStart[0], layer.ribbonColorStart[1], layer.ribbonColorStart[2]);
      setUniform3f(prog, "uRibbonColorMid",   layer.ribbonColorMid[0],   layer.ribbonColorMid[1],   layer.ribbonColorMid[2]);
      setUniform3f(prog, "uRibbonColorEnd",   layer.ribbonColorEnd[0],   layer.ribbonColorEnd[1],   layer.ribbonColorEnd[2]);

      setUniform1f(prog, "uParticleMotionEnabled", 1);
      setUniform1f(prog, "uParticleMotionAge", simAge);
      setUniform2f(prog, "uParticleMotionPointer", state.particleMotion.pointer[0], state.particleMotion.pointer[1]);
      setUniform2f(prog, "uParticleMotionPrevious", state.particleMotion.previous[0], state.particleMotion.previous[1]);
      setUniform2f(prog, "uParticleMotionImpulse", state.particleMotion.impulse[0], state.particleMotion.impulse[1]);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layer.pathTexture);
      setUniform1i(prog, "uPathTexture", 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, pathShapeTexture);
      setUniform1i(prog, "uPathShapeTexture", 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, simFront.tex);
      setUniform1i(prog, "uParticleMotionTexture", 2);
    }

    function drawQuad(prog) {
      const loc = attributeLocation(prog, "position");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    let lastTime = performance.now();
    window.__astra = { state, input, CONFIG, rebuildField };

    _addDomListener(document, "visibilitychange", () => {
      if (!isLightQuality || _destroyed) return;
      if (document.hidden) {
        cancelAnimationFrame(_rafId);
        _rafId = 0;
      } else if (!_rafId) {
        lastTime = performance.now();
        _rafId = requestAnimationFrame(frame);
      }
    });

    function frame(now) {
      _rafId = 0;
      if (_destroyed || (isLightQuality && document.hidden)) return;
      _rafId = requestAnimationFrame(frame);
      // Follow the display refresh rate, rendering as fast as this device can.
      const rawDt = (now - lastTime) / 1000;
      const clockDt = clamp(rawDt, 0, 0.5);
      const dt = clamp(rawDt, 0, 0.05);
      lastTime = now;

      state.elapsed += clockDt;
      const k = CONFIG.convergeDuration;
      state.introElapsed = Math.min(state.introElapsed + clockDt, k);
      state.introProgress = clamp(state.introElapsed / k, 0, 1);

      const scrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      const disperseDist = Math.max(820, Math.min(CONFIG.scrollDisperseDistance, Math.max(vpHeight * 1.35, 960)));
      const rawScrollProgress = Math.max(0, scrollY - CONFIG.scrollStartOffset) / disperseDist;

      // Update mode targets (native scroll drives 3D tilt + starfield expansion + parallax drift)
      if (state.targetMode === "logo" || state.targetMode === "six") {
        input.dispersedStrength = rawScrollProgress;
        input.shapeStrength = 0;
      } else if (state.targetMode === "dispersed") {
        input.dispersedStrength = Math.max(1.25, rawScrollProgress);
        input.shapeStrength = 0;
      } else if (state.targetMode === "cursor" || state.targetMode === "openai-knot") {
        input.dispersedStrength = Math.max(1.25, rawScrollProgress);
        input.shapeStrength = 1;
      }

      const U = input.dispersedStrength;
      state.scrollProgress = dampSnap(state.scrollProgress, U, dt, 3.2);
      state.tiltProgress   = dampSnap(state.tiltProgress, clamp(U, 0, 1), dt, 3.6);
      state.themeProgress  = dampSnap(state.themeProgress, state.themeTarget, dt, 4.5);

      const G = 0.375, H = 1.1875;
      const targetScatterScroll = state.scrollProgress;
      state.scatterScrollProgress = dampSnap(state.scatterScrollProgress, targetScatterScroll, dt, 3.6);
      const Z = smootherstep(state.scatterScrollProgress, G, H);
      const K = smoothstep(smootherstep(U, G, H), 0, 1);
      state.scatterPositionProgress = dampSnap(state.scatterPositionProgress, K, dt, 2.8);

      const spiralPresence = (1 - Z) * smoothstep(state.introProgress, 0.55, 1);
      const J = smootherstep(state.scrollProgress, 0, 0.5);
      const spiralTilt = degToRad(-52) * Math.sin(clamp(state.tiltProgress / 0.75, 0, 1) * Math.PI * 0.5) * (1 - smootherstep(state.tiltProgress, 0.75, 1));
      const scrollSizeScale = lerp(1, 0.68, J);

      // Dynamic fade of side labels on scroll down (smoothly fades out as stars disperse)
      const copyOpVal = 1 - smoothstep(state.scrollProgress, 0.04, 0.32);
      const copyOpStr = copyOpVal.toFixed(3);
      if (state._lastCopyOpStr !== copyOpStr) {
        state._lastCopyOpStr = copyOpStr;
        document.documentElement.style.setProperty("--astra-copy-opacity", copyOpStr);
        document.documentElement.style.setProperty("--astra-trigger-events", copyOpVal > 0.25 ? "auto" : "none");
      }

      // Dynamic reveal and 3D assembly of Scrolled-Down Liquid Glass Login Window in dispersed starfield
      // assembleVal: 0 when at top (scattered/exploded in 3D space), 1 when fully assembled at login stage
      const assembleRaw = clamp((state.scrollProgress - 0.16) / (0.96 - 0.16), 0, 1);
      const assembleVal = smootherstep(assembleRaw, 0, 1);
      const disperseVal = 1 - assembleVal;
      const loginOpVal = smootherstep(clamp((state.scrollProgress - 0.18) / (0.90 - 0.18), 0, 1), 0, 1);

      const assembleStr = assembleVal.toFixed(3);
      const disperseStr = disperseVal.toFixed(3);
      const loginOpStr = loginOpVal.toFixed(3);

      if (state._lastLoginOpStr !== loginOpStr || state._lastAssembleStr !== assembleStr) {
        state._lastLoginOpStr = loginOpStr;
        state._lastAssembleStr = assembleStr;
        document.documentElement.style.setProperty("--astra-login-opacity", loginOpStr);
        document.documentElement.style.setProperty("--astra-assemble", assembleStr);
        document.documentElement.style.setProperty("--astra-disperse", disperseStr);
        const loginStageEl = document.getElementById("astra-login-stage");
        if (loginStageEl) {
          loginStageEl.dataset.interactive = loginOpVal > 0.65 ? "true" : "false";
        }
      }

      // Spin root & shape rotation
      const dampAlpha = 1 - Math.exp(-(input.returning ? 5.5 : 14) * dt);
      state.spinRotation[0] = lerp(state.spinRotation[0], input.rotation.x, dampAlpha);
      state.spinRotation[1] = lerp(state.spinRotation[1], input.rotation.y, dampAlpha);

      state.shapeProgress = dampSnap(state.shapeProgress, input.shapeStrength, dt, 6);
      const tf = smoothstep(input.shapeStrength, 0, 1);
      state.shapePositionProgress = dampSnap(state.shapePositionProgress, tf, dt, 4);

      const shapeRotWeight = smootherstep(state.shapeProgress, 0.05, 0.4);
      state.shapePointerRotation[0] = lerp(state.shapePointerRotation[0], input.rotation.x, dampAlpha);
      state.shapePointerRotation[1] = lerp(state.shapePointerRotation[1], input.rotation.y, dampAlpha);
      const autoRotAmt = CONFIG.pathShapeAutoRotateAmount;
      const nRot = smootherstep(state.shapeProgress, 0.001, 0.12);
      const lRot = smootherstep(state.shapeProgress, 0.04, 0.82);
      const dRot = lerp(-autoRotAmt, 0, lRot) * nRot;
      const fRot = lRot > 0 && lRot < 1 ? Math.sin(lRot * Math.PI) : 0;
      state.shapeRotation[0] = state.shapePointerRotation[0] * shapeRotWeight - fRot * autoRotAmt * 0.34 * nRot;
      state.shapeRotation[1] = state.shapePointerRotation[1] * shapeRotWeight + dRot;

      // Particle motion impulse
      const pm = state.particleMotion;
      if (input.pointer.reset) {
        pm.epoch++;
        pm.remaining = 0;
        pm.active = false;
        input.pointer.reset = false;
        resetSim();
      }
      const repelActive = !isLightQuality && input.pointer.active && !input.pointer.pressed;
      pm.impulse[0] = 0; pm.impulse[1] = 0;
      if (repelActive) {
        pm.previous[0] = pm.pointer[0];
        pm.previous[1] = pm.pointer[1];
        pm.pointer[0] = input.pointer.x;
        pm.pointer[1] = input.pointer.y;
        if (pm.active) {
          pm.impulse[0] = pm.pointer[0] - pm.previous[0];
          pm.impulse[1] = pm.pointer[1] - pm.previous[1];
          if (pm.impulse[0]*pm.impulse[0] + pm.impulse[1]*pm.impulse[1] > 1e-8) {
            pm.remaining = PARTICLE_MOTION_SETTLE_SECONDS;
          }
        } else {
          pm.previous[0] = pm.pointer[0];
          pm.previous[1] = pm.pointer[1];
        }
      }
      pm.active = repelActive;
      pm.pressed = input.pointer.pressed;
      pm.remaining = Math.max(0, pm.remaining - dt);

      // Camera & viewport math (exact match to 3m0x6eidiggo3.js)
      const tc = vpWidth / Math.max(vpHeight, 1);
      const th = tc < 0.72 ? 12.7 : 10.9;
      const tu = th * tc;
      const tR = lerp(1.2, 0, J);
      const zoom = vpHeight / th;

      // View matrix: camera at (0, tR, 12) looking at (0, tR, 0)
      mat4ComposeEulerXYZ(viewMatrix, 0, -tR, -12, 0, 0, 0, 1);

      // Orthographic projection matrix
      const near = 0.1, far = 40;
      projMatrix.fill(0);
      projMatrix[0]  = (2 * zoom) / vpWidth;
      projMatrix[5]  = (2 * zoom) / vpHeight;
      projMatrix[10] = -2 / (far - near);
      projMatrix[14] = -(far + near) / (far - near);
      projMatrix[15] = 1;
      mat4Multiply(viewProjMat, projMatrix, viewMatrix);

      const centerCore = vpWidth < 768;
      const animRootY = (centerCore ? tR : 0) * (1 - Z) * (1 - state.shapeProgress);
      mat4ComposeEulerXYZ(animRootMat, 0, animRootY, 0, 0, 0, 0, 1);
      mat4ComposeEulerXYZ(bgModelMatrix, 0, animRootY, 0, 0, 0, 0, 1);

      const sx = state.spinRotation[0] * spiralPresence;
      const sy = state.spinRotation[1] * spiralPresence;
      mat4ComposeEulerXYZ(groupLocalMat, 0, 0, 0, sx, sy, 0, 1);
      mat4Multiply(spinRootMat, animRootMat, groupLocalMat);

      // Core cluster rotation
      const coreSpeed = 0.36 * CONFIG.stars.flowSpeed;
      state.coreTargetRotation = positiveModulo(state.coreTargetRotation + dt * coreSpeed + Math.PI, 2 * Math.PI) - Math.PI;
      const coreDiff = Math.atan2(Math.sin(state.coreTargetRotation - state.coreRotation), Math.cos(state.coreTargetRotation - state.coreRotation));
      state.coreRotation = positiveModulo(state.coreRotation + coreDiff * (1 - Math.exp(-14 * dt)) + Math.PI, 2 * Math.PI) - Math.PI;

      const tM = clamp(Z * (1 - state.shapeProgress), 0, 1);
      const tx = lerp(1, 0.76, tM);
      const tb = lerp(1, 0.35, tM);
      const tV = th * tc * 1.12;
      const tE = th * 1.12;
      const tw = 0, tS = 0;
      const scrollDrift = (state.targetMode === "dispersed" && scrollY < 10 ? state.elapsed * 0.15 : state.scrollProgress) * CONFIG.scrollStarDriftSpeed;

      // Shape size in world space
      const activeShape = SHAPE_LIBRARY[input.shapeId] || SHAPE_LIBRARY.cursor;
      const maxShapeW = Math.min(576, vpWidth * 0.82);
      const maxShapeH = vpHeight * 0.76;
      const shapeAspect = activeShape.aspectRatio;
      const boxW = maxShapeW / maxShapeH > shapeAspect ? maxShapeH * shapeAspect : maxShapeW;
      const boxH = boxW / shapeAspect;
      const shapeSizeWorld = [(boxW / vpWidth) * tu, (boxH / vpHeight) * th];
      const shapeCenterWorld = [0, 0];

      const uState = {
        intensity: CONFIG.stars.intensity * tx,
        dispersedMotion: tM,
        spiralPresence,
        scrollScatter: Z,
        scrollSizeScale,
        spiralTilt,
        scrollDrift,
        scatterSize: [tV, tE],
        textBounds: [tw, tS],
        shapeCenter: shapeCenterWorld,
        shapeSize: shapeSizeWorld
      };

      // Update per-layer matrices, travel, and flare source 3D tracking
      const tN = input.returning ? 5.5 : 14;
      const tL = CONFIG.interaction.rotationLag;
      const scratchPos = [0, 0, 0], scratchPrev = [0, 0, 0], scratchNext = [0, 0, 0];
      const scratchFormed = [0, 0, 0], scratchScat = [0, 0, 0], scratchDisp = [0, 0];
      const scratchRange = [0, 1];
      const isLogoMode = CONFIG.shapeMode === "logo";

      for (const layer of field.pathLayers) {
        if (layer.isCore) {
          const crx = 0.08 * Math.sin(0.22 * state.elapsed) * spiralPresence;
          const cry = 0.14 * Math.cos(0.28 * state.elapsed) * spiralPresence;
          const crz = (isLogoMode ? 0.06 * Math.sin(0.35 * state.elapsed) : state.coreRotation) * spiralPresence;
          mat4ComposeEulerXYZ(groupLocalMat, 0, 0, 0, crx, cry, crz, 1);
        } else {
          const aLag = 1 - Math.exp(-(tN / (1 + layer.lag * tL * 2.5)) * dt);
          layer.spin[0] = lerp(layer.spin[0], input.rotation.x, aLag);
          layer.spin[1] = lerp(layer.spin[1], input.rotation.y, aLag);
          const gx = layer.spin[0] * spiralPresence - sx;
          const gy = layer.spin[1] * spiralPresence - sy;
          mat4ComposeEulerXYZ(groupLocalMat, 0, 0, 0, gx, gy, 0, 1);
        }
        mat4Multiply(groupWorldMat, spinRootMat, groupLocalMat);
        layer.modelViewMat = mat4Multiply(new Float32Array(16), viewMatrix, groupWorldMat);

        const spd = layer.isCore ? 0.022 : Math.abs(layer.speed);
        const cShape = smootherstep(state.shapeProgress, 0.08, 0.5);
        layer.pathShapeTravel = positiveModulo(layer.pathShapeTravel + dt * spd * (CONFIG.stars.flowInward ? 1 : -1) * CONFIG.stars.flowSpeed * cShape, 1);
        layer.motionOffset = positiveModulo(layer.motionOffset + dt * layer.speed * CONFIG.stars.flowSpeed * spiralPresence, 1);
        layer.travel = positiveModulo(layer.travel + dt * Math.abs(layer.speed) * spiralPresence, 1);

        // Compute exact 3D flare source position & scale (matching lines 1-300 of 3m0x6eidiggo3.js)
        const lSamples = layer.flarePathSamples;
        const hasPath = lSamples !== null;
        const hProg = positiveModulo(layer.flareProgress + layer.motionOffset, 1);
        const fProg = hasPath ? (layer.seamEnvelope > 0.5 ? lerp(hProg, densityProgress(hProg, CONFIG.stars.densityFalloff), 0.35) : densityProgress(hProg, CONFIG.stars.densityFalloff)) : 0;

        if (lSamples) {
          const step = 1 / 511;
          samplePathJS(lSamples, fProg, scratchPos);
          samplePathJS(lSamples, Math.max(fProg - step, 0), scratchPrev);
          samplePathJS(lSamples, Math.min(fProg + step, 1), scratchNext);
          const dx = scratchNext[0] - scratchPrev[0], dy = scratchNext[1] - scratchPrev[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          scratchPos[0] += nx * layer.flareAcrossOffset;
          scratchPos[1] += ny * layer.flareAcrossOffset;
          scratchPos[2] += layer.flareDepthOffset;
        } else {
          scratchPos[0] = layer.flareBasePosition[0];
          scratchPos[1] = layer.flareBasePosition[1];
          scratchPos[2] = layer.flareBasePosition[2];
        }

        applyEulerXYZ(scratchPos, spiralTilt, 0, 0);

        const fx = Math.fround(layer.flareScatter[0]);
        const fy = Math.fround(layer.flareScatter[1]);
        const fz = Math.fround(layer.flareScatter[2]);
        const keepCenter = Number(Math.fround(layer.flareClearanceSeed) >= 0.72);
        const side = fx < 0.5 ? -1 : 1;
        const outerP = Math.sqrt(positiveModulo(2 * fx, 1));
        const outerX = side * lerp(side < 0 ? -tw : tS, 0.5 * tV, outerP);
        getAstraDispersedMotionOffsetJS(scratchDisp, Math.fround(state.elapsed), fx, fy, fz, scrollDrift, tM);

        scratchScat[0] = lerp(outerX, (fx - 0.5) * tV, keepCenter) + scratchDisp[0];
        scratchScat[1] = positiveModulo((fy - 0.5) * tE + scratchDisp[1] + 0.5 * tE, tE) - 0.5 * tE - Math.sin(state.scatterPositionProgress * Math.PI) * (0.15 + 0.25 * fz);
        scratchScat[2] = (fz - 0.5) * 0.5;

        scratchPos[0] = lerp(scratchPos[0], scratchScat[0], state.scatterPositionProgress);
        scratchPos[1] = lerp(scratchPos[1], scratchScat[1], state.scatterPositionProgress);
        scratchPos[2] = lerp(scratchPos[2], scratchScat[2], state.scatterPositionProgress);

        let A_fade = hasPath ? (layer.seamEnvelope > 0.5 ? smoothstep(fProg, 0.0, 0.04) * (1 - smoothstep(fProg, 0.96, 1.0)) : tipFade(fProg)) : 1;
        let R_size = hasPath ? (layer.seamEnvelope > 0.5 ? lerp(0.88, 1.06, Math.sin(fProg * Math.PI)) : sizeFalloffFn(fProg, CONFIG.stars.sizeFalloff)) : 1;
        A_fade = lerp(A_fade, 1, Z);
        R_size = lerp(R_size, 1, Z);
        let kCue = 1, TCue = 1;

        if (state.shapeProgress > 0 || state.shapePositionProgress > 0) {
          const sSamples = activeShape.samples;
          samplePathRangeJS(sSamples, layer.flareShapeSeed, scratchRange);
          const r0 = scratchRange[0], r1 = scratchRange[1];
          const span = Math.max(r1 - r0, 1 / 1024);
          const nLoc = densityProgress(clamp((layer.flareShapeSeed - r0) / span, 0, 1) + layer.pathShapeTravel / span, CONFIG.stars.densityFalloff);
          const lSeed = lerp(r0, r1, nLoc);
          samplePathJS(sSamples, lSeed, scratchFormed);
          samplePathJS(sSamples, Math.max(lSeed - 1 / 1023, r0), scratchPrev);
          samplePathJS(sSamples, Math.min(lSeed + 1 / 1023, r1), scratchNext);
          const tdx = (scratchNext[0] - scratchPrev[0]) * shapeSizeWorld[0] + 1e-4;
          const tdy = (scratchNext[1] - scratchPrev[1]) * shapeSizeWorld[1];
          const tLen = Math.hypot(tdx, tdy) || 1;
          const snx = -tdy / tLen, sny = tdx / tLen;
          const env = Math.sin(nLoc * Math.PI);
          const cDepth = Math.sin(nLoc * Math.PI * 1.35 + layer.pathShapeDepthPhase) * layer.pathShapeDepth * env;
          const rel = [
            scratchFormed[0] * shapeSizeWorld[0] + snx * (1.1 * layer.flareAcrossOffset + layer.flareShapeAcrossScatter),
            scratchFormed[1] * shapeSizeWorld[1] + sny * (1.1 * layer.flareAcrossOffset + layer.flareShapeAcrossScatter),
            cDepth + 0.75 * layer.flareDepthOffset + layer.flareShapeDepthScatter
          ];
          applyEulerYXZ(rel, state.shapeRotation[0], state.shapeRotation[1]);
          scratchPos[0] = lerp(scratchPos[0], shapeCenterWorld[0] + rel[0], state.shapePositionProgress);
          scratchPos[1] = lerp(scratchPos[1], shapeCenterWorld[1] + rel[1], state.shapePositionProgress);
          scratchPos[2] = lerp(scratchPos[2], rel[2], state.shapePositionProgress);
          const front = smoothstep(rel[2], -1.15, 1.15);
          A_fade = lerp(A_fade, tipFade(nLoc), state.shapeProgress);
          R_size = lerp(R_size, sizeFalloffFn(nLoc, CONFIG.stars.sizeFalloff), state.shapeProgress);
          kCue = lerp(1, lerp(0.78, 1.18, front), state.shapeProgress);
          TCue = lerp(1, lerp(0.72, 1.0, front), state.shapeProgress);
        }

        scratchFormed[0] = (fx - 0.5) * tV;
        scratchFormed[1] = (positiveModulo(fy, 1) - 0.5) * tE;
        scratchFormed[2] = (fz - 0.5) * 0.5;
        applyAstraIntroMotionJS(scratchPos, scratchFormed, state.introProgress, fz, fy);

        const revP = getAstraParticleRevealProgressJS(state.introProgress, fz);
        const revScale = Math.sqrt(revP) * smoothstep(revP, 0, ASTRA_PARTICLE_OPACITY_REVEAL_END);
        const scFinal = A_fade * R_size * kCue * TCue * lerp(scrollSizeScale, 1, state.shapeProgress) * revScale * tb;

        transformPointMat4(layer.flareWorldPos, scratchPos, groupWorldMat);
        layer.flareScale = clamp(scFinal, 0, 1);
      }

      // -----------------------------------------------------------------------
      // PASS 0: GPU Particle Repulsion Simulation (Ping-Pong 128 x simRows)
      // -----------------------------------------------------------------------
      simAge = Math.min(PARTICLE_MOTION_SETTLE_SECONDS, simAge + dt);
      if (showParticles && pm.impulse[0]*pm.impulse[0] + pm.impulse[1]*pm.impulse[1] > 1e-8) {
        gl.disable(gl.BLEND);
        if (!simInitialized) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, simFront.fb);
          gl.viewport(0, 0, 128, field.simRows);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          simAge = 0;
          simInitialized = true;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, simBack.fb);
        gl.viewport(0, 0, 128, field.simRows);
        gl.useProgram(simProg);
        for (const layer of field.pathLayers) {
          applyLayerUniforms(simProg, layer, uState);
          bindStarAttributes(simProg, layer.buffers);
          gl.drawArrays(gl.POINTS, 0, layer.count);
        }
        const tmp = simFront; simFront = simBack; simBack = tmp;
        simAge = 0;
      }

      // -----------------------------------------------------------------------
      // PASS 1: Render HDR Stars into sceneFBO
      // -----------------------------------------------------------------------
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
      gl.viewport(0, 0, sceneFBO.width, sceneFBO.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (showParticles) {
        gl.enable(gl.BLEND);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(starProg);
        for (const layer of field.pathLayers) {
          applyLayerUniforms(starProg, layer, uState);
          bindStarAttributes(starProg, layer.buffers);
          gl.drawArrays(gl.POINTS, 0, layer.count);
        }
        gl.disable(gl.BLEND);
      }

      // -----------------------------------------------------------------------
      // PASS 2: Multi-Level HDR Bloom (Threshold + 3-level Separable Blur)
      // -----------------------------------------------------------------------
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomThreshFBO.fb);
      gl.viewport(0, 0, bloomThreshFBO.width, bloomThreshFBO.height);
      gl.useProgram(threshProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
      setUniform1i(threshProg, "inputBuffer", 0);
      setUniform2f(threshProg, "sourceTexelSize", 1 / sceneFBO.width, 1 / sceneFBO.height);
      setUniform1f(threshProg, "threshold", CONFIG.bloomThreshold);
      setUniform1f(threshProg, "smoothing", 0.18);
      drawQuad(threshProg);

      function blurLevel(srcTex, fboH, fboV, scale = 1.0) {
        gl.useProgram(blurProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboH.fb);
        gl.viewport(0, 0, fboH.width, fboH.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        setUniform1i(blurProg, "source", 0);
        setUniform2f(blurProg, "stepSize", scale / fboH.width, 0);
        drawQuad(blurProg);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fboV.fb);
        gl.viewport(0, 0, fboV.width, fboV.height);
        gl.bindTexture(gl.TEXTURE_2D, fboH.tex);
        setUniform2f(blurProg, "stepSize", 0, scale / fboV.height);
        drawQuad(blurProg);
      }

      blurLevel(bloomThreshFBO.tex, bloomHighH, bloomHighV, 1.0);
      blurLevel(bloomHighV.tex, bloomMidH, bloomMidV, 1.25);
      blurLevel(bloomMidV.tex, bloomLowH, bloomLowV, 1.5);

      // -----------------------------------------------------------------------
      // PASS 3: Final Composite (Scene + Bloom + AstraLensFlare + Dirty Glass)
      // -----------------------------------------------------------------------
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
      setUniform1i(compProg, "inputBuffer", 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomHighV.tex);
      setUniform1i(compProg, "uBloomHigh", 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, bloomMidV.tex);
      setUniform1i(compProg, "uBloomMid", 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, bloomLowV.tex);
      setUniform1i(compProg, "uBloomLow", 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, dirtTexture);
      setUniform1i(compProg, "uDirtTexture", 4);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, simFront.tex);
      setUniform1i(compProg, "uParticleMotionTexture", 5);

      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, lightCloudTexture);
      setUniform1i(compProg, "uCloudTexture", 6);

      setUniform1f(compProg, "uBloomIntensity", CONFIG.bloomIntensity);
      setUniform1f(compProg, "uParticleMotionAge", simAge);

      // Project core flare source & 5 secondary flare sources
      const coreLayer = field.pathLayers[field.coreLayerIndex];
      setUniform3f(compProg, "uPrimaryMotionUv", coreLayer.heroMotionUv[0], coreLayer.heroMotionUv[1], coreLayer.heroMotionUv[2]);

      const projPt = [0, 0, 0];
      transformPointMat4(projPt, coreLayer.flareWorldPos, viewProjMat);
      const visEdge = (pt) => {
        if (pt[2] < -1 || pt[2] > 1) return 0;
        const m = Math.max(Math.abs(pt[0]), Math.abs(pt[1]));
        return 1 - smoothstep(m, 0.88, 1.08);
      };
      const coreFade = 1 - smootherstep(clamp(state.scrollProgress, 0, 1), 0.5, 1);
      setUniform2f(compProg, "uCenter", 0.5 * projPt[0] + 0.5, 0.5 * projPt[1] + 0.5);
      setUniform1f(compProg, "uVisibility", visEdge(projPt) * coreFade * coreLayer.flareScale);

      for (let i = 0; i < 5; i++) {
        const secIdx = field.secondaryFlareIndices[i] ?? i;
        const lyr = field.pathLayers[secIdx];
        setUniform3f(compProg, `uSecondaryMotionUvs[${i}]`, lyr.heroMotionUv[0], lyr.heroMotionUv[1], lyr.heroMotionUv[2]);
        transformPointMat4(projPt, lyr.flareWorldPos, viewProjMat);
        setUniform2f(compProg, `uSecondaryCenters[${i}]`, 0.5 * projPt[0] + 0.5, 0.5 * projPt[1] + 0.5);
        setUniform1f(compProg, `uSecondaryVisibility[${i}]`, lyr.flareScale * visEdge(projPt));
      }

      setUniform1f(compProg, "uAnimated", 1);
      setUniform1f(compProg, "uAspect", vpWidth / Math.max(vpHeight, 1));
      setUniform1f(compProg, "uDirtyGlassEnabled", Number(CONFIG.dirtyGlass.enabled));
      setUniform1f(compProg, "uDistortion", CONFIG.dirtyGlass.distortion);
      setUniform1f(compProg, "uDirtTextureAspect", 256 / 192);

      const driftStrength = CONFIG.dirtyGlass.driftStrength;
      const dirtOffX = -(0.032 * Math.sin(sy)) * driftStrength;
      const dirtOffY =  (0.032 * Math.sin(sx)) * driftStrength;
      const dirtRot  = -(0.055 * Math.sin(0.5 * sy)) * driftStrength;
      setUniform2f(compProg, "uDirtTextureOffset", dirtOffX, dirtOffY);
      setUniform1f(compProg, "uDirtTextureRotation", dirtRot);

      setUniform1f(compProg, "uFlareEnabled", Number(CONFIG.lensFlare.enabled && showParticles));
      setUniform1f(compProg, "uGhosts", CONFIG.lensFlare.ghosts);
      setUniform1f(compProg, "uGrain", CONFIG.dirtyGlass.grain);
      setUniform1f(compProg, "uHalo", CONFIG.lensFlare.halo);
      setUniform1f(compProg, "uIntensity", CONFIG.lensFlare.intensity);
      setUniform1f(compProg, "uProceduralDirt", CONFIG.dirtyGlass.procedural);
      setUniform1f(compProg, "uSecondaryIntensity", CONFIG.lensFlare.secondary);
      setUniform1f(compProg, "uStreakLength", CONFIG.lensFlare.streakLength);
      setUniform1f(compProg, "uStreaks", CONFIG.lensFlare.streaks);
      setUniform1f(compProg, "uTime", state.elapsed);
      setUniform1f(compProg, "uTextureDirt", CONFIG.dirtyGlass.texture);
      setUniform1f(compProg, "uVerticalStreaks", CONFIG.lensFlare.verticalStreaks);
      setUniform1f(compProg, "uTheme", state.themeProgress);
      setUniform1f(compProg, "uLightQuality", Number(isLightQuality));
      setUniform1f(compProg, "uScrollProgress", state.scrollProgress);
      setUniform1f(compProg, "uShowLogo", showParticles ? 1.0 : 0.0);

      drawQuad(compProg);
    }

    if (!_destroyed) _rafId = requestAnimationFrame(frame);

    
  function setTheme(theme, immediate = false) {
    document.documentElement.dataset.theme = theme;
    state.themeTarget = theme === 'light' ? 1 : 0;
    if (immediate) state.themeProgress = state.themeTarget;
  }

  function replayAnimation() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    state.introElapsed = 0;
    state.introProgress = 0;
    state.targetMode = CONFIG.shapeMode;
    input.rotation.x = 0;
    input.rotation.y = 0;
    input.returning = true;
    input.pointer.reset = true;
  }

  return {
    setTheme,
    replayAnimation,
    getScrollTarget() {
      const disperseDist = Math.max(820, Math.min(CONFIG.scrollDisperseDistance, Math.max(vpHeight * 1.35, 960)));
      return Math.round(disperseDist * 1.08);
    },
    destroy() {
      _destroyed = true;
      if (_rafId) cancelAnimationFrame(_rafId);
      if (_ro) {
        try { _ro.disconnect(); } catch {}
      }
      for (const [type, fn, opts] of _winListeners) {
        try { window.removeEventListener(type, fn, opts); } catch {}
      }
      for (const [target, type, fn, opts] of _domListeners) {
        try { target.removeEventListener(type, fn, opts); } catch {}
      }
      _domListeners.length = 0;
      // Mode changes mount a fresh canvas. Release the old GPU allocation now.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      try {
        delete document.documentElement.dataset.theme;
      } catch {}
    }
  };
}
