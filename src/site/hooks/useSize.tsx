import { useState, useLayoutEffect } from 'react';
import useResizeObserver from '@react-hook/resize-observer';

export const useSize = (target: React.RefObject<HTMLDivElement>) => {
  const [size, setSize] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (target.current) {
      setSize(target.current.getBoundingClientRect());
    }
  }, [target]);

  // Where the magic happens
  useResizeObserver(target, (entry) => setSize(entry.contentRect));
  return size;
};
