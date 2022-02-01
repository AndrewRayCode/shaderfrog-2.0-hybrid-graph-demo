import dynamic from 'next/dynamic';

const DynamicComponentWithNoSSR = dynamic(() => import('../../src/Babylon'), {
  ssr: false,
});

function Editor() {
  return <DynamicComponentWithNoSSR />;
}

export default Editor;
