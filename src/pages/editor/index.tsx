import dynamic from 'next/dynamic';

const DynamicComponentWithNoSSR = dynamic(
  () => import('../../editor/components/Editor'),
  {
    ssr: false,
  }
);

function Editor() {
  return <DynamicComponentWithNoSSR />;
}

export default Editor;
