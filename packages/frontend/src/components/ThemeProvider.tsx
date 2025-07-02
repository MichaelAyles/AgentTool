import { useEffect } from 'react';
import { useUI, useUIActions } from '../store';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useUI();
  const { setTheme } = useUIActions();

  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      // Check system preference
      const systemPrefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      root.classList.add(systemPrefersDark ? 'dark' : 'light');

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark');
        root.classList.add(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Use explicit theme
      root.classList.add(theme);
    }
  }, [theme]);

  return <>{children}</>;
}

export function ThemeToggle() {
  const { theme } = useUI();
  const { setTheme } = useUIActions();

  const toggleTheme = () => {
    const themes: Array<typeof theme> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'system':
        return '💻';
      default:
        return '💻';
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className='p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
      title={`Current theme: ${theme} (click to change)`}
    >
      <span className='text-lg'>{getThemeIcon()}</span>
    </button>
  );
}
