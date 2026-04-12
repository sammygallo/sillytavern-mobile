import { useState, useEffect } from 'react';

/**
 * Returns the estimated height (in px) of the on-screen virtual keyboard
 * by comparing `window.innerHeight` to `visualViewport.height`.
 * Returns 0 on desktop or when the keyboard is closed.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      const kbHeight = window.innerHeight - vv.height;
      setKeyboardHeight(Math.max(0, kbHeight));
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  return keyboardHeight;
}
