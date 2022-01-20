import '../styles/globals.css';
import '../styles/flow.theme.css';
import '../styles/resizer.custom.css';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
