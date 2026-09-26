'use client';

import { Game } from '@xayaarcade/sdk';
import type { CSSProperties } from 'react';
import { LanguagePicker, LanguageProvider, useLanguage } from '@/components/LanguageProvider';
import { pulseAdapter } from '@/lib/games/pulse-adapter';

function LocalizedGame() {
  const { t } = useLanguage();
  // The SDK reads this presentational hint from our registered adapter on render.
  pulseAdapter.controlsHint = t.controlsHint;
  return <Game />;
}

export default function Home() {
  const shellStyle = {
    '--pulse-stadium': `url("${process.env.NEXT_PUBLIC_BASE_PATH || ''}/art/stadium-night.jpg")`,
  } as CSSProperties;
  return <LanguageProvider><div className="pulse-app-shell" style={shellStyle}><LanguagePicker /><LocalizedGame /></div></LanguageProvider>;
}
