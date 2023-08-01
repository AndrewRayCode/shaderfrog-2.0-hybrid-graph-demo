import dynamic from 'next/dynamic';
import styles from '../editor/styles/Home.module.css';

const DynamicComponentWithNoSSR = dynamic(
  () => import('../editor/components/Editor'),
  {
    ssr: false,
    loading: () => <div style={{ color: '#fff' }}>Loarfing&hellip;</div>,
  }
);

function Editor() {
  return <DynamicComponentWithNoSSR />;
}

export default Editor;
