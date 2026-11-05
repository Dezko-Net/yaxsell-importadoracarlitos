(() => {
  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  // Hyper-detailed Volumetric Sky Engine from PROYECT ARGON (4 moving cloud layers + god rays + Beer-Powder lighting).
  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uAccount;
    varying vec2 vUv;

    float astraHash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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
      float rawAspect = uResolution.x / max(uResolution.y, 1.0);
      // Wide cover bands (e.g. /cuenta desktop 5:1) map into the Argon 16:9 sky dome
      // without over-stretching the clouds or pushing the sky window off-screen.
      float uAspect = uAccount > 0.5 ? clamp(rawAspect * 0.42, 1.15, 1.85) : clamp(rawAspect, 1.0, 2.2);
      vec2 aspectUv = (uv - vec2(0.5, 0.5)) * vec2(uAspect, 1.0);
      float centerDist = length(aspectUv);

      // 1. Multi-Band Rayleigh + Mie Stratospheric Sky Dome
      vec3 skyCosmos  = vec3(0.018, 0.065, 0.210);
      vec3 skyUpper   = vec3(0.048, 0.145, 0.380);
      vec3 skyMid     = vec3(0.095, 0.245, 0.520);
      vec3 skyHorizon = vec3(0.280, 0.455, 0.700);
      vec3 skyWarmth  = vec3(0.420, 0.360, 0.480);

      float y1 = smoothstep(0.0, 0.38, uv.y);
      float y2 = smoothstep(0.28, 0.72, uv.y);
      float y3 = smoothstep(0.60, 1.0, uv.y);
      vec3 sky = mix(skyHorizon, skyMid, y1);
      sky = mix(sky, skyUpper, y2);
      sky = mix(sky, skyCosmos, y3);
      sky += skyWarmth * pow(clamp(1.0 - uv.y, 0.0, 1.0), 3.2) * 0.22;

      // Celestial Sun Position & Mie Solar Corona
      vec2 sunPos = vec2(-0.52 * uAspect, 0.38);
      vec2 toSun = sunPos - aspectUv;
      float sunDist = length(toSun);
      vec2 sunDir = normalize(vec2(-0.68, 0.73));
      sky += vec3(0.22, 0.27, 0.35) * exp(-sunDist * 1.85);
      sky += vec3(0.35, 0.32, 0.26) * exp(-sunDist * 5.5);

      // Gentle camera drift matching Argon
      vec2 camShift = vec2(uTime * 0.012, -uTime * 0.006);
      float persp = 1.0 / (0.46 + uv.y * 0.72);
      vec2 cloudP = vec2(aspectUv.x * persp * 1.65, (uv.y - 0.48) * persp * 2.15) + camShift;

      // LAYER A: High-Altitude Sheared Jetstream Cirrus
      vec2 cirrusCoord = vec2(cloudP.x * 1.4 + cloudP.y * 0.6, cloudP.y * 2.4 - cloudP.x * 0.3) + vec2(4.2, -1.9);
      float cirrusWave = warpFbm(cirrusCoord * 1.35, vec2(uTime * 0.055, uTime * 0.018));
      float cirrusFine = skyNoise(cirrusCoord * 5.5 + vec2(uTime * 0.11, -uTime * 0.04));
      float cirrusMask = smoothstep(0.50, 0.80, cirrusWave * 0.82 + cirrusFine * 0.18)
                       * smoothstep(0.18, 0.88, uv.y) * 0.42;
      vec3 cirrusCol = mix(vec3(0.38, 0.52, 0.74), vec3(0.75, 0.83, 0.94), exp(-sunDist * 1.4));
      sky = mix(sky, cirrusCol, cirrusMask);

      // LAYER B: Volumetric Crepuscular God-Rays
      float godRayAccum = 0.0;
      vec2 rayStep = toSun * 0.14;
      vec2 raySamplePos = aspectUv;
      for (int r = 0; r < 5; r++) {
        raySamplePos += rayStep;
        vec2 rCloudP = raySamplePos * 1.55 + camShift * 0.8;
        float rOcc = warpFbm(rCloudP * 1.15 + vec2(2.3, 4.7), vec2(uTime * 0.075, uTime * 0.018));
        godRayAccum += smoothstep(0.62, 0.38, rOcc);
      }
      godRayAccum = (godRayAccum / 5.0) * exp(-sunDist * 1.35) * smoothstep(0.05, 0.85, uv.y);
      sky += vec3(0.20, 0.25, 0.34) * godRayAccum * 0.68;

      // LAYER C: Towering Domain-Warped Cumulus Clouds + Beer-Powder Self-Shadowing
      float skyWindow = mix(0.68, 1.12, smoothstep(0.10, 0.66, centerDist));
      float horizonArch = mix(1.10, 0.90, smoothstep(0.0, 0.68, uv.y));
      vec2 cumCoord = cloudP * 1.18 + vec2(2.3, 4.7);

      float rawShape = cumulusFbm(cumCoord, uTime, 0.078);
      float detail   = warpFbm(cumCoord * 2.95 + vec2(11.2, -7.4), vec2(uTime * 0.135, -uTime * 0.045));
      float sculpted = (rawShape * 0.76 + detail * 0.24) * skyWindow * horizonArch;
      float cloudDensity = smoothstep(0.45, 0.75, sculpted);

      float s1 = cumulusFbm(cumCoord + sunDir * 0.075, uTime, 0.078);
      float s2 = cumulusFbm(cumCoord + sunDir * 0.180, uTime, 0.078);

      float opticalDepth = max(0.0, s1 - rawShape) * 1.85
                         + max(0.0, s2 - rawShape) * 1.10;
      float transmittance = exp(-opticalDepth * 1.45);
      float powder = 1.0 - exp(-cloudDensity * 2.8);
      float directLight = clamp(0.48 + transmittance * (0.32 + 0.35 * powder) + (uv.y - 0.25) * 0.10, 0.0, 1.0);

      float rimLight = pow(clamp(1.0 - cloudDensity * 0.80, 0.0, 1.0), 2.0)
                     * smoothstep(0.43, 0.64, sculpted)
                     * transmittance;

      vec3 cloudSoftBase   = max(sky * 0.96, vec3(0.240, 0.390, 0.630));
      vec3 cloudMidAmbient = max(sky * 1.08, vec3(0.420, 0.560, 0.760));
      vec3 cloudWarmRim    = vec3(0.650, 0.745, 0.875);
      vec3 cloudSunCrown   = vec3(0.840, 0.895, 0.968);

      vec3 cloudCol = mix(cloudSoftBase, cloudMidAmbient, smoothstep(0.25, 0.58, directLight));
      cloudCol = mix(cloudCol, cloudWarmRim, smoothstep(0.50, 0.78, directLight));
      cloudCol = mix(cloudCol, cloudSunCrown, smoothstep(0.70, 0.98, directLight));
      cloudCol += vec3(0.20, 0.23, 0.28) * rimLight;

      // LAYER D: Fast Foreground Cloud Wisps
      vec2 fgCoord = (aspectUv * vec2(1.35, 2.35) + camShift * 1.55) + vec2(-4.1, 6.8);
      float fgRaw = cumulusFbm(fgCoord, uTime, 0.135);
      float fgMask = smoothstep(0.48, 0.78, fgRaw * mix(0.72, 1.08, smoothstep(0.14, 0.66, centerDist)))
                   * smoothstep(0.86, 0.02, uv.y);
      float fgSun = cumulusFbm(fgCoord + sunDir * 0.085, uTime, 0.135);
      float fgLit = clamp(0.52 + 0.48 * exp(-max(0.0, fgSun - fgRaw) * 2.2), 0.0, 1.0);
      vec3 fgSoftShadow = max(sky * 0.98, vec3(0.280, 0.440, 0.680));
      vec3 fgCol = mix(fgSoftShadow, vec3(0.82, 0.88, 0.96), smoothstep(0.35, 0.92, fgLit));

      vec3 skyWithClouds = mix(sky, cloudCol, cloudDensity * 0.88);
      skyWithClouds = mix(skyWithClouds, fgCol, fgMask * 0.68);

      float logoPocket = smoothstep(0.56, 0.06, centerDist);
      skyWithClouds *= mix(1.0, 0.88, logoPocket);

      vec3 finalColor = clamp(skyWithClouds * 1.12 + vec3(0.008, 0.018, 0.035), 0.0, 1.0);
      gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
    }
  `;

  const active = new Set();

  function dispose(instance) {
    if (instance.frameId) cancelAnimationFrame(instance.frameId);
    instance.observer?.disconnect();
    instance.resizeObserver?.disconnect();
    window.removeEventListener('resize', instance.onResize);
    document.removeEventListener('visibilitychange', instance.onVisibility);
    instance.motionQuery?.removeEventListener('change', instance.onMotion);
    instance.cleanup?.();
    active.delete(instance);
  }

  function stop() {
    [...active].forEach(dispose);
  }

  function mountCanvas(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) return;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('No se pudo iniciar el cielo volumétrico:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('No se pudo enlazar el cielo volumétrico:', gl.getProgramInfoLog(program));
      return;
    }

    const position = gl.getAttribLocation(program, 'aPosition');
    const resolution = gl.getUniformLocation(program, 'uResolution');
    const time = gl.getUniformLocation(program, 'uTime');
    const account = canvas.dataset.sky === 'account';
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, 'uAccount'), account ? 1 : 0);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const instance = {
      frameId: 0, observer: null, resizeObserver: null, visible: false,
      lastFrame: 0, elapsed: 0, onResize: null, onVisibility: null, motionQuery, onMotion: null,
      cleanup: () => { gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); }
    };
    active.add(instance);

    function draw(now) {
      instance.frameId = 0;
      if (!canvas.isConnected) {
        dispose(instance);
        return;
      }
      if (!instance.visible || document.hidden) return;

      if (!motionQuery.matches && now - instance.lastFrame < 33) {
        instance.frameId = requestAnimationFrame(draw);
        return;
      }
      instance.elapsed += Math.min((now - instance.lastFrame) / 1000, 0.06);
      instance.lastFrame = now;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, motionQuery.matches ? 0 : instance.elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      instance.frameId = motionQuery.matches ? 0 : requestAnimationFrame(draw);
    }

    function schedule() {
      if (instance.visible && !document.hidden && !instance.frameId) {
        instance.frameId = requestAnimationFrame(draw);
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      const quality = Math.min(dpr, account ? 1.5 : 1.0, Math.sqrt((account ? 520000 : 180000) / (rect.width * rect.height)));
      canvas.width = Math.max(1, Math.round(rect.width * quality));
      canvas.height = Math.max(1, Math.round(rect.height * quality));
      gl.viewport(0, 0, canvas.width, canvas.height);
      schedule();
    }

    function onVisibility() {
      if (document.hidden && instance.frameId) {
        cancelAnimationFrame(instance.frameId);
        instance.frameId = 0;
      } else {
        schedule();
      }
    }

    instance.onResize = resize;
    instance.onVisibility = onVisibility;
    instance.onMotion = () => {
      if (instance.frameId) cancelAnimationFrame(instance.frameId);
      instance.frameId = 0;
      schedule();
    };
    motionQuery.addEventListener('change', instance.onMotion);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    instance.resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    instance.resizeObserver?.observe(canvas.parentElement);
    instance.observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      instance.visible = entries[0].isIntersecting;
      if (instance.visible) schedule();
      else if (instance.frameId) {
        cancelAnimationFrame(instance.frameId);
        instance.frameId = 0;
      }
    }, { threshold: 0.01 }) : null;
    instance.observer?.observe(canvas);
    if (!instance.observer) instance.visible = true;
    resize();
    schedule();
  }

  function mount() {
    stop();
    document.querySelectorAll('.hero-sky-canvas').forEach(mountCanvas);
  }

  window.mountVolumetricHero = mount;
  if (document.readyState !== 'loading') {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
})();
