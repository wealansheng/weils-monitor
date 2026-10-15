/** Wait for Vue's DOM flush and the following browser paint. */
export const afterPaint = (callback: () => void): void => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(callback, 0);
    return;
  }

  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
};
