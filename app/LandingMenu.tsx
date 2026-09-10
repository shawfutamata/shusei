'use client';

import styles from './LandingPage.module.css';

export default function LandingMenu() {
  return <details className={styles.mobileMenu}
    onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) event.currentTarget.open = false; }}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary aria-label="メニューを開く"><span aria-hidden="true">☰</span></summary>
    <nav aria-label="モバイルナビゲーション"><a href="#about">TASUKIとは</a><a href="#how">使い方</a><a href="#plans">料金プラン</a><a href="#advertising">広告掲載</a><a href="#start">招待コードで始める</a></nav>
  </details>;
}
