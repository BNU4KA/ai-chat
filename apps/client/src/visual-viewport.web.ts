import { useEffect } from 'react';

export function useVisualViewportFrame() {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const frame = window.visualViewport;
      if (!frame) return;
      root.style.setProperty('--app-height', `${frame.height}px`);
      root.style.setProperty('--app-top', `${frame.offsetTop}px`);
    };
    apply();
    const frame = window.visualViewport;
    frame?.addEventListener('resize', apply);
    frame?.addEventListener('scroll', apply);
    return () => {
      frame?.removeEventListener('resize', apply);
      frame?.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-top');
    };
  }, []);
}
