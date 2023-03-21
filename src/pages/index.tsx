import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../site/styles/Home.module.css';
import Router from 'next/router';
import { useEffect } from 'react';

const Home: NextPage = () => {
  useEffect(() => {
    const isLocal = window.location.toString().includes('localhost');
    Router.push(isLocal ? '/editor' : '/editor.html');
  }, []);
  return (
    <div className={styles.container}>
      <Head>
        <title>Shaderfrog 2.0 Hybrid Graph Demo</title>
        <meta name="description" content="Shaderfrog 2.0 Hybrid Graph Demo" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Link href="/editor">
        <a style={{ color: '#fff' }}>/editor</a>
      </Link>
    </div>
  );
};

export default Home;
