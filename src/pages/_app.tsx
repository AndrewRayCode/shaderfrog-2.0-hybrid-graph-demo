import '../editor/styles/globals.css';
import '../editor/styles/forms.css';
import '../editor/styles/flow.theme.css';
import '../editor/styles/resizer.custom.css';
import 'reactflow/dist/style.css';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
