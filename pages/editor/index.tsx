import dynamic from 'next/dynamic';

const DynamicComponentWithNoSSR = dynamic(() => import('./Editor'), {
  ssr: false,
});

function Editor() {
  return <DynamicComponentWithNoSSR />;
}

export default Editor;
