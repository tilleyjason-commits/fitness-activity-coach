import { useEffect, useState } from 'react';

/**
 * Live dark-mode flag driven by the `dark` class on <html> (the app's theme
 * strategy). Charts use this so tooltip/cursor colors follow a theme toggle
 * immediately instead of waiting for a remount.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
