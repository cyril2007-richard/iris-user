import { COLORS } from '@/theme/colors';

function useColorScheme() {
  return {
    colorScheme: 'light',
    isDarkColorScheme: false,
    setColorScheme: () => {},
    toggleColorScheme: () => {},
    colors: COLORS['light'],
  };
}

export { useColorScheme };
