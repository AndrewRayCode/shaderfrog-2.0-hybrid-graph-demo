import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../site/styles/Home.module.css';

const Home: NextPage = () => {
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Link href="/editor">
        <a>/editor</a>
      </Link>
    </div>
  );
};

export default Home;