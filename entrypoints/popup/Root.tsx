import { useMemo } from 'react';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  useMediaQuery,
} from '@mui/material';
import App from './App';

function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      // Synced with the browser theme via prefers-color-scheme.
      mode,
      // Brand red carried over from the legacy badge color (#db4343).
      primary: { main: '#db4343' },
    },
    typography: {
      // Compact density (spec 002 US1): slightly smaller base type.
      fontSize: 13,
    },
  });
}

export default function Root() {
  // Follows the browser theme live (Chrome/Firefox both expose it to
  // extension pages as prefers-color-scheme).
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => buildTheme(dark ? 'dark' : 'light'), [dark]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}
