import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as three from 'three';
import useOnce from './useOnce';

type Callback = (time: number) => void;

export const useThree = (callback: Callback) => {
  const [threeDom, setThreeDom] = useState<HTMLDivElement | null>(null);
  const threeDomRef = useCallback((node) => setThreeDom(node), []);

  const frameRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls>();
  const scene = useOnce(() => new three.Scene());
  const camera = useOnce(
    () => new three.PerspectiveCamera(75, 1 / 1, 0.1, 1000)
  );

  useEffect(() => {
    if (!scene.children.find((child) => child === camera)) {
      camera.position.set(0, 0, 3);
      camera.lookAt(0, 0, 0);
      scene.add(camera);
    }
  }, [scene, camera]);

  const renderer = useOnce(() => new three.WebGLRenderer());

  const savedCallback = useRef<Callback>(callback);
  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (threeDom && !threeDom.childNodes.length) {
      console.log(
        'Re-attaching three.js DOM and instantiate OrbitControls, appendingx',
        renderer.domElement,
        'to',
        threeDom
      );
      threeDom.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.update();
      controlsRef.current = controls;
    }
  }, [camera, renderer, threeDom]);

  // TODO: This is clearly wrong because the cleanup effect gets called
  // way too often. It should onlmcay get called when - when the dom ref is
  // unmounted? Also was initially thinking of a way to pause this renderer
  // but I think it's solved by the
  const animate = useCallback(
    (time: number) => {
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
      savedCallback.current(time);

      frameRef.current = requestAnimationFrame(animate);
    },
    [camera, renderer, scene]
  );

  useEffect(() => {
    if (threeDom) {
      console.log('🎬 Starting requestAnimationFrame');
      frameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      console.log('🛑 Cleaning up Three animationframe');
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [animate, threeDom]);

  return { threeDomRef, scene, camera, renderer };
};
