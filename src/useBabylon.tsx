import { useCallback, useEffect, useRef, useState } from 'react';
import * as BABYLON from 'babylonjs';
import useOnce from './useOnce';

type Callback = (time: number) => void;

export const useBabylon = (callback: Callback) => {
  const [babylonCanvas] = useState(() => document.createElement('canvas'));

  const [babylonDom, setBabylonDom] = useState<HTMLCanvasElement | null>(null);
  const babylonDomRef = useCallback((node) => setBabylonDom(node), []);

  const frameRef = useRef<number>(0);

  const [engine] = useState(
    () =>
      new BABYLON.Engine(babylonCanvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      })
  );

  const [scene] = useState(() => new BABYLON.Scene(engine));

  const [camera] = useState(
    () =>
      new BABYLON.FreeCamera('camera1', new BABYLON.Vector3(0, 5, -10), scene)
  );

  useEffect(() => {
    console.log('targeting camera at 0');
    // Target the camera to scene origin
    camera.setTarget(BABYLON.Vector3.Zero());
    // Attach the camera to the canvas
    camera.attachControl(babylonCanvas, false);
  }, [scene, camera, babylonCanvas]);

  const savedCallback = useRef<Callback>(callback);
  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (babylonDom && !babylonDom.childNodes.length) {
      console.log('Re-attaching Babylon DOM', babylonCanvas, 'to', babylonDom);
      babylonDom.appendChild(babylonCanvas);
    }
  }, [babylonCanvas, babylonDom]);

  const animate = useCallback(
    (time: number) => {
      scene.render();
      savedCallback.current(time);

      frameRef.current = requestAnimationFrame(animate);
    },
    [scene]
  );

  useEffect(() => {
    if (babylonDom) {
      console.log('🎬 Starting Babylon requestAnimationFrame');
      frameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      console.log('🛑 Cleaning up Babylon animationframe');
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      // TODO: How to cleanup?
      // engine.dispose();
    };
  }, [engine, animate, babylonDom]);

  return { babylonCanvas, babylonDomRef, engine, scene, camera };
};
