'use client';

import { useEffect, useRef } from 'react';

/** Muestra el modelo GLB exportado desde cloud-mascot.html, incluidos sus ojos 3D. */
export default function OrdersCloudMascot({
  variant = 'inline',
  className,
}: {
  variant?: 'inline' | 'cover' | 'hero';
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let lastRenderedAt = 0;
    let isVisible = true;
    let renderer: import('three').WebGLRenderer | null = null;
    let scene: import('three').Scene | null = null;
    let camera: import('three').OrthographicCamera | null = null;
    let mascot: import('three').Object3D | null = null;
    let leftEye: import('three').Object3D | null = null;
    let rightEye: import('three').Object3D | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let onVisibilityChange: (() => void) | null = null;
    let onReducedMotionChange: (() => void) | null = null;
    let onPointerMove: ((event: PointerEvent) => void) | null = null;
    let onPointerLeave: (() => void) | null = null;
    let animate = () => {};
    const start = () => {
      if (!frame && mascot && !disposed && isVisible && !document.hidden) {
        frame = requestAnimationFrame(() => animate());
      }
    };
    let mascotWidth = 1.5;
    let mascotHeight = 1.5;
    let mascotBaseY = 0;
    let surfaceTexture: import('three').DataTexture | null = null;
    let environment: import('three').WebGLRenderTarget | null = null;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const disposeModel = (model: import('three').Object3D) => {
      model.traverse(node => {
        const mesh = node as import('three').Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material?.dispose?.();
      });
    };

    const initialize = async () => {
      const [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/environments/RoomEnvironment.js'),
      ]);
      if (disposed || !host) return;

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.domElement.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.38;
      room.dispose();
      pmrem.dispose();
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
      camera.position.set(0, 0, 5.15);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xe6f3ff, variant === 'cover' || variant === 'hero' ? 0xb0bfd1 : 0x7187a4, variant === 'hero' ? 1.15 : (variant === 'cover' ? 1.05 : 0.85)));
      const keyLight = new THREE.DirectionalLight(0xfff4df, 2.6);
      keyLight.position.set(-2.4, 3.5, 4.5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd9eaff, 0.5);
      fillLight.position.set(3.5, 0.5, 2.5);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0xd7ecff, 2.2);
      rimLight.position.set(2, 2.5, -2);
      scene.add(rimLight);

      const resize = () => {
        if (!renderer || !camera || !host) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        const aspect = width / height;
        const margin = variant === 'hero' ? 1.05 : 1.2;
        const viewHeight = Math.max(mascotHeight, mascotWidth / aspect) * margin;
        camera.left = -(viewHeight * aspect) / 2;
        camera.right = (viewHeight * aspect) / 2;
        camera.top = viewHeight / 2;
        camera.bottom = -viewHeight / 2;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        if (mascot) start();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);

      const loader = new GLTFLoader();
      loader.load('/models/cloud_mascot.glb', gltf => {
        if (disposed || !scene) {
          disposeModel(gltf.scene);
          return;
        }

        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        mascotWidth = size.x;
        mascotHeight = size.y;
        model.position.sub(center);
        mascot = new THREE.Group();
        mascot.add(model);
        mascotBaseY = mascot.position.y;
        scene.add(mascot);
        leftEye = mascot.getObjectByName('LeftEye') || null;
        rightEye = mascot.getObjectByName('RightEye') || null;
        // Small, repeatable microrelief catches the light without changing the silhouette.
        const texSize = 128;
        const pixels = new Uint8Array(texSize * texSize * 4);
        let seed = 42;
        for (let y = 0; y < texSize; y++) {
          for (let x = 0; x < texSize; x++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const grain = seed / 4294967296;
            const billow = Math.sin(x * Math.PI / 16) * Math.cos(y * Math.PI / 16);
            const value = Math.round(150 + billow * 22 + grain * 35);
            const i = (y * texSize + x) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
            pixels[i + 3] = 255;
          }
        }
        surfaceTexture = new THREE.DataTexture(pixels, texSize, texSize);
        surfaceTexture.wrapS = surfaceTexture.wrapT = THREE.RepeatWrapping;
        surfaceTexture.repeat.set(6, 6);
        surfaceTexture.magFilter = THREE.LinearFilter;
        surfaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
        surfaceTexture.generateMipmaps = true;
        surfaceTexture.needsUpdate = true;
        const body = mascot.getObjectByName('CloudBody') as import('three').Mesh | undefined;
        if (body) {
          const colors = body.geometry.attributes.color;
          if (colors) {
            for (let i = 0; i < colors.count; i++) {
              const base = variant === 'cover' || variant === 'hero' ? 0.91 : 0.82;
              colors.setXYZ(i, base + colors.getX(i) * (1 - base), base + colors.getY(i) * (1 - base), base + colors.getZ(i) * (1 - base));
            }
            colors.needsUpdate = true;
          }
          const original = body.material;
          body.material = new THREE.MeshPhysicalMaterial({
            color: 0xf8fbff, vertexColors: !!body.geometry.attributes.color,
            roughness: 0.88, metalness: 0, sheen: 0.32,
            sheenColor: new THREE.Color(0xe1eeff), sheenRoughness: 0.95,
            bumpMap: surfaceTexture, bumpScale: 0.009,
          });
          if (Array.isArray(original)) original.forEach(material => material.dispose());
          else original.dispose();
        }
        // The HTML exporter puts these spheres almost inside the white sclera;
        // bring them forward so the original large pupils and catchlights remain visible.
        const gazeParts: { mesh: import('three').Mesh; x: number; y: number }[] = [];
        [leftEye, rightEye].forEach(eye => {
          if (!eye) return;
          // Shorter, softly rounded eyes give the cloud a relaxed expression.
          eye.scale.set(0.142, 0.162, 0.085);
          const sclera = (eye as import('three').Mesh).material as import('three').MeshStandardMaterial;
          if (sclera?.isMeshStandardMaterial) {
            sclera.roughness = 0.22;
            sclera.metalness = 0;
          }
          eye.children.forEach(child => {
            if (!('isMesh' in child) || !(child as import('three').Mesh).isMesh) return;
            const mesh = child as import('three').Mesh;
            if (mesh.scale.z < 0.5) mesh.position.z = 1.02;
            else mesh.position.z = 1.18;
            gazeParts.push({ mesh, x: mesh.position.x, y: mesh.position.y });
          });
        });

        const smileCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.078, -0.148, 0.49),
          new THREE.Vector3(0, -0.222, 0.50),
          new THREE.Vector3(0.078, -0.148, 0.49),
        );
        const smile = new THREE.Mesh(
          new THREE.TubeGeometry(smileCurve, 24, 0.009, 8, false),
          new THREE.MeshStandardMaterial({ color: 0x4b4268, roughness: 0.85 }),
        );
        smile.name = 'GentleSmile';
        (mascot.getObjectByName('CloudMascotRoot') || model).add(smile);

        let elapsed = 0;
        let nextBlink = 2.3;
        let blinkStarted = -1;
        let nextGlance = 1.8;
        let gazeX = 0;
        let gazeY = 0;
        let targetX = 0;
        let targetY = 0;
        let pointerTargetActive = false;
        let lastPointerAt = 0;
        let turnX = 0;
        let turnY = 0;
        let velocityX = 0;
        let velocityY = 0;

        onPointerMove = event => {
          if (event.pointerType === 'touch' || prefersReducedMotion.matches) return;
          const rect = host.getBoundingClientRect();
          const horizontal = (event.clientX - rect.left - rect.width / 2) / Math.max(window.innerWidth * 0.42, 1);
          const vertical = (rect.top + rect.height / 2 - event.clientY) / Math.max(window.innerHeight * 0.42, 1);
          targetX = Math.max(-1, Math.min(1, horizontal)) * 0.32;
          targetY = Math.max(-1, Math.min(1, vertical)) * 0.22;
          pointerTargetActive = true;
          lastPointerAt = performance.now();
          start();
        };
        onPointerLeave = () => {
          pointerTargetActive = false;
          targetX = 0;
          targetY = 0;
          start();
        };
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerleave', onPointerLeave);
        window.addEventListener('blur', onPointerLeave);
        resize();

        visibilityObserver = new IntersectionObserver(([entry]) => {
          isVisible = entry.isIntersecting;
          if (isVisible) start();
          else stop();
        }, { threshold: 0.01 });
        visibilityObserver.observe(host);

        animate = () => {
          frame = 0;
          if (disposed || !renderer || !scene || !camera || !mascot || document.hidden || !isVisible) {
            stop();
            return;
          }
          const now = performance.now();
          if (!prefersReducedMotion.matches && now - lastRenderedAt < 1000 / 60) {
            start();
            return;
          }
          // Clamp the delta so returning to a hidden tab never jumps the animation.
          const delta = Math.min((now - lastRenderedAt) / 1000, 0.05);
          lastRenderedAt = now;
          const motion = prefersReducedMotion.matches ? 0 : 1;
          elapsed += delta * motion;
          const breath = Math.sin(elapsed * 1.35) * motion;
          mascot.position.y = mascotBaseY + (Math.sin(elapsed * 1.05) * 0.033 + Math.sin(elapsed * 1.9) * 0.008) * motion;
          mascot.position.x = Math.sin(elapsed * 0.53) * 0.018 * motion;
          mascot.rotation.z = (Math.sin(elapsed * 0.8) * 0.018 - turnY * 0.12) * motion;
          mascot.scale.set(1 - breath * 0.003, 1 + breath * 0.005, 1 - breath * 0.002);
          if (pointerTargetActive && now - lastPointerAt > 2400) pointerTargetActive = false;

          if (!pointerTargetActive && elapsed >= nextGlance) {
            // Mostly looks at the adjacent message, with occasional small glances.
            targetX = (Math.random() - 0.5) * 0.4;
            targetY = (Math.random() - 0.5) * 0.16;
            nextGlance = elapsed + 3.5 + Math.random() * 3;
          }
          // Damped head movement follows the eyes, with a slight natural lag.
          velocityX += ((-targetY * 0.28 - turnX) * 32 - velocityX * 11) * delta;
          velocityY += ((targetX * 0.4 - turnY) * 32 - velocityY * 11) * delta;
          turnX += velocityX * delta;
          turnY += velocityY * delta;
          mascot.rotation.x = turnX * motion;
          mascot.rotation.y = (turnY + Math.sin(elapsed * 0.58) * 0.025) * motion;
          const ease = 1 - Math.exp(-delta * 10);
          gazeX += (targetX - gazeX) * ease;
          gazeY += (targetY - gazeY) * ease;
          const gazeMotion = motion;
          gazeParts.forEach(({ mesh, x, y }) => {
            mesh.position.x = x + gazeX * gazeMotion;
            mesh.position.y = y + gazeY * gazeMotion;
          });
          if (elapsed >= nextBlink) {
            blinkStarted = elapsed;
            nextBlink = elapsed + 3 + Math.random() * 3;
          }
          const blinkTime = elapsed - blinkStarted;
          // Quick close, slower release instead of a symmetrical squash.
          const blink = motion && blinkStarted >= 0 && blinkTime < 0.24
            ? (blinkTime < 0.075 ? Math.sin(blinkTime / 0.075 * Math.PI / 2) : Math.cos((blinkTime - 0.075) / 0.165 * Math.PI / 2)) : 0;
          if (leftEye) leftEye.scale.y = 0.162 * (1 - blink * 0.92);
          if (rightEye) rightEye.scale.y = 0.162 * (1 - blink * 0.92);
          renderer.render(scene, camera);
          if (fallbackRef.current) fallbackRef.current.hidden = true;
          const gazeSettling = Math.abs(targetX - gazeX) > 0.001 || Math.abs(targetY - gazeY) > 0.001;
          if (!prefersReducedMotion.matches || gazeSettling) start();
        };
        start();
      }, undefined, () => {
        if (!disposed && host) host.dataset.mascotUnavailable = 'true';
      });

      onVisibilityChange = () => document.hidden ? stop() : start();
      onReducedMotionChange = () => {
        stop();
        start();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      prefersReducedMotion.addEventListener('change', onReducedMotionChange);
    };

    initialize().catch(() => {
      if (!disposed && host) host.dataset.mascotUnavailable = 'true';
    });

    return () => {
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
      if (onReducedMotionChange) prefersReducedMotion.removeEventListener('change', onReducedMotionChange);
      if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
      if (onPointerLeave) {
        window.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('blur', onPointerLeave);
      }
      if (mascot) disposeModel(mascot);
      surfaceTexture?.dispose();
      environment?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-label="Mascota 3D con ojos de la tienda"
      className={
        className ||
        (variant === 'hero'
          ? 'relative h-[320px] w-[350px] sm:h-[420px] sm:w-[460px] flex-shrink-0'
          : variant === 'cover'
          ? 'relative h-[152px] w-[196px] flex-shrink-0'
          : 'relative h-[92px] w-[108px] flex-shrink-0 sm:h-[112px] sm:w-[128px]')
      }
      style={{ contain: 'strict' }}
    >
      <span ref={fallbackRef} aria-hidden="true" className="absolute inset-0 grid place-items-center text-5xl">☁️</span>
    </div>
  );
}
