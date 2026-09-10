'use client';

import { useEffect, useRef } from 'react';
import styles from './ConnectionSculpture.module.css';

export default function ConnectionSculpture() {
  const trackRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current!;
    const host = hostRef.current!;
    let disposed = false;
    let teardown = () => {};
    void Promise.all([import('three'), import('three/addons/environments/RoomEnvironment.js')]).then(([T, { RoomEnvironment }]) => {
      if (disposed) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-4, 4, 4, -4, .1, 50);
      camera.position.set(3.5, 3, 8);
      camera.lookAt(0, 0, 0);
      const pmrem = new T.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const environment = pmrem.fromScene(room, .04);
      scene.environment = environment.texture;
      scene.environmentIntensity = .65;
      room.dispose();
      pmrem.dispose();
      scene.add(new T.HemisphereLight(0xffffff, 0xaaa9a3, 1.2));
      const light = new T.DirectionalLight(0xfff7ee, 2);
      light.position.set(-3, 6, 5);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      Object.assign(light.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
      light.shadow.bias = -.001;
      scene.add(light);
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const shadowContext = shadowCanvas.getContext('2d')!;
      const falloff = shadowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
      falloff.addColorStop(0, 'rgba(36,43,49,.22)');
      falloff.addColorStop(.45, 'rgba(36,43,49,.1)');
      falloff.addColorStop(1, 'rgba(36,43,49,0)');
      shadowContext.fillStyle = falloff;
      shadowContext.fillRect(0, 0, 128, 128);
      const shadowMap = new T.CanvasTexture(shadowCanvas);
      const floor = new T.Mesh(new T.PlaneGeometry(6, 4), new T.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -3.5;
      scene.add(floor);

      // Procedural material textures stay local: no image requests or member data.
      let seed = 31;
      const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const texture = (wood: boolean) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = wood ? '#c8a372' : '#eeece6';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < (wood ? 420 : 2600); i++) {
          ctx.fillStyle = wood ? `rgba(80,44,14,${random() * .19})` : `rgba(93,86,73,${random() * .23})`;
          if (wood) {
            ctx.beginPath();
            const x = random() * 512;
            ctx.moveTo(x, 0);
            ctx.bezierCurveTo(x + 20, 150, x - 16, 310, x + 8, 512);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = random() * 2;
            ctx.stroke();
          } else {
            const size = random() * 5 + .5;
            ctx.fillRect(random() * 512, random() * 512, size, size * .7);
          }
        }
        const map = new T.CanvasTexture(canvas);
        map.colorSpace = T.SRGBColorSpace;
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.repeat.set(.7, .7);
        return map;
      };
      const stone = texture(false);
      const wood = texture(true);
      const materials = ['#1868db', '#eeeae2', '#d4b58c', '#1c2b42', '#b4d8c3', '#1868db', '#e8b536', '#eeeae2'].map((color, i) => new T.MeshStandardMaterial({
        color: i === 1 || i === 7 || i === 2 ? '#ffffff' : color,
        map: i === 1 || i === 7 ? stone : i === 2 ? wood : null,
        bumpMap: i === 1 || i === 7 ? stone : i === 2 ? wood : null,
        bumpScale: .018, roughness: i === 0 || i === 5 ? .3 : .65,
        metalness: i === 0 || i === 5 ? .45 : .04,
      }));
      const connectorMaterial = new T.MeshStandardMaterial({ color: '#f15a24', roughness: .36 });
      const ring = new T.Group();
      scene.add(ring);
      const segments = Array.from({ length: 8 }, (_, i) => {
        const angle = i * Math.PI / 4;
        const half = Math.PI / 8 - .014;
        const shape = new T.Shape();
        // Beveled annular modules share a precise, continuous inner opening.
        shape.absarc(0, 0, 2.1, -half, half, false);
        shape.absarc(0, 0, 1.1, half, -half, true);
        shape.closePath();
        const geometry = new T.ExtrudeGeometry(shape, { depth: .75, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: .045, bevelThickness: .045, curveSegments: 20 });
        geometry.translate(-1.6, 0, -.375);
        const group = new T.Group();
        const mesh = new T.Mesh(geometry, materials[i]);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        const connector = new T.Mesh(new T.BoxGeometry(.26, .13, .34), connectorMaterial);
        connector.position.set(1.6 * Math.cos(half) - 1.6, 1.6 * Math.sin(half), 0);
        connector.rotation.z = half;
        group.add(connector);
        ring.add(group);
        return { group, angle };
      });

      let frame = 0;
      let visible = true;
      let progress = 0;
      const media = matchMedia('(prefers-reduced-motion: reduce)');
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      const readProgress = () => {
        if (media.matches) return 1;
        const mobile = innerWidth <= 600;
        const target = mobile ? track : track.closest('section')!;
        const rect = target.getBoundingClientRect();
        return clamp((76 - rect.top) / Math.max(1, rect.height - innerHeight));
      };
      const draw = () => {
        frame = 0;
        if (disposed || !visible || document.hidden) return;
        const target = readProgress();
        progress = media.matches ? 1 : progress + (target - progress) * .2;
        if (Math.abs(target - progress) < .0002) progress = target;
        let connected = 0;
        segments.forEach(({ group, angle }, i) => {
          const p = clamp((progress - i * .095) / .24);
          // A short overshoot settles each module with a tactile snap.
          const t = p - 1;
          const snap = p === 0 ? 0 : p === 1 ? 1 : 1 + 2.5 * t * t * t + 1.5 * t * t;
          const spread = 1 - snap;
          const radius = 1.6 + spread * (.9 + (i % 3) * .2);
          group.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, spread * (i % 2 ? .7 : -.5));
          group.rotation.set(spread * (i % 2 ? .5 : -.6), spread * .55, angle + spread * (i % 2 ? .65 : -.65));
          if (p >= 1) connected++;
        });
        ring.rotation.set(-.12 + progress * .24, -.15 + progress * .25, -.4 + progress * 1.25);
        camera.zoom = 1 + progress * .15;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        host.dataset.ready = 'true';
        host.dataset.progress = progress.toFixed(3);
        host.dataset.connected = String(connected);
        if (progress !== target) frame = requestAnimationFrame(draw);
      };
      const request = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw); };
      const resize = () => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        renderer.setSize(width, height);
        const aspect = width / height;
        const extent = Math.max(4.1, 4.1 / aspect);
        camera.left = -extent * aspect; camera.right = extent * aspect;
        camera.top = extent; camera.bottom = -extent;
        camera.updateProjectionMatrix();
        request();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; request(); });
      intersection.observe(host);
      const contextLost = (event: Event) => { event.preventDefault(); delete host.dataset.ready; };
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      renderer.domElement.addEventListener('webglcontextrestored', request);
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', request);
      media.addEventListener('change', request);
      resize();
      teardown = () => {
        cancelAnimationFrame(frame);
        observer.disconnect(); intersection.disconnect();
        window.removeEventListener('scroll', request);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', request);
        media.removeEventListener('change', request);
        scene.traverse(object => { if (object instanceof T.Mesh) object.geometry.dispose(); });
        materials.forEach(material => material.dispose());
        connectorMaterial.dispose(); floor.material.dispose(); shadowMap.dispose(); stone.dispose(); wood.dispose(); environment.dispose();
        renderer.dispose(); renderer.domElement.remove(); delete host.dataset.ready;
      };
    }).catch(() => { /* Keep the approved image when WebGL is unavailable. */ });
    return () => { disposed = true; teardown(); };
  }, []);

  return <div ref={trackRef} className={styles.track}>
    <div className={styles.sticky}>
      <div ref={hostRef} className={styles.scene} role="img" aria-label="異素材の8つのパーツが、スクロールに合わせて回転し、ひとつの輪につながるTASUKIの立体オブジェ">
        <img className={styles.fallback} src="/lp/tasuki-connection-hero-v1.webp" alt="" width="960" height="1200"/>
      </div>
      <p className={styles.hint}>SCROLL TO CONNECT <span aria-hidden="true">↓</span></p>
    </div>
  </div>;
}
