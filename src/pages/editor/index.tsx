import dynamic from 'next/dynamic';

const DynamicComponentWithNoSSR = dynamic(
  () => import('../../site/components/Editor'),
  {
    ssr: false,
  }
);

function Editor() {
  return <DynamicComponentWithNoSSR />;
}

export default Editor;
