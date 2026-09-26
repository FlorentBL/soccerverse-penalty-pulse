'use client';

import { Game } from '@xayaarcade/sdk';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import DevPreview from '@/components/DevPreview';
import { LanguagePicker, LanguageProvider, useLanguage } from '@/components/LanguageProvider';
import { pulseAdapter } from '@/lib/games/pulse-adapter';

function LocalizedGame() {
  const { t } = useLanguage();
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const sync = () => setPreview(new URLSearchParams(window.location.search).get('preview') === '1');
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function showPreview(show: boolean) {
    const url = new URL(window.location.href);
    if (show) url.searchParams.set('preview', '1');
    else url.searchParams.delete('preview');
    window.history.pushState(null, '', url);
    setPreview(show);
  }
  // The SDK reads this presentational hint from our registered adapter on render.
  pulseAdapter.controlsHint = t.controlsHint;
  if (process.env.NODE_ENV === 'development' && preview)
    return <DevPreview onExit={() => showPreview(false)} />;
  return <>
    {process.env.NODE_ENV === 'development' &&
      <button type="button" className="pulse-preview-entry" onClick={() => showPreview(true)}>{t.previewButton}<span aria-hidden="true">↗</span></button>}
    <Game />
  </>;
}

export default function Home() {
  const shellStyle = {
    '--pulse-stadium': `url("${process.env.NEXT_PUBLIC_BASE_PATH || ''}/art/stadium-night.jpg")`,
  } as CSSProperties;
  return <LanguageProvider><div className="pulse-app-shell" style={shellStyle}><LanguagePicker /><LocalizedGame /></div></LanguageProvider>;
}
