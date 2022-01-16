import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as three from 'three';

export const useThree = (callback: (time: number) => void) => {
  const threeDomRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls>();
  const scene = useMemo(() => new three.Scene(), []);
  const camera = useMemo(() => {
    const camera = new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    return camera;
  }, [scene]);

  const renderer = useMemo(() => new three.WebGLRenderer(), []);

  useEffect(() => {
    if (threeDomRef.current) {
      threeDomRef.current.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.update();
      controlsRef.current = controls;
    }
  }, [camera, renderer]);

  const animate = useCallback(
    (time: number) => {
      callback(time);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    },
    [callback, renderer, scene, camera]
  );

  useEffect(() => {
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      console.log('🛑 Cleaning up Three animationframe');
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [animate]);

  return { threeDomRef, scene, camera, renderer };
};
