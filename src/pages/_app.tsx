import '../site/styles/globals.css';
import '../site/styles/forms.css';
import '../site/styles/flow.theme.css';
import '../site/styles/resizer.custom.css';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
