'use client';

import { Game } from '@xayaarcade/sdk';
import { LanguagePicker, LanguageProvider, useLanguage } from '@/components/LanguageProvider';
import { pulseAdapter } from '@/lib/games/pulse-adapter';

function LocalizedGame() {
  const { t } = useLanguage();
  // The SDK reads this presentational hint from our registered adapter on render.
  pulseAdapter.controlsHint = t.controlsHint;
  return <Game />;
}

export default function Home() {
  return <LanguageProvider><div className="pulse-app-shell"><LanguagePicker /><LocalizedGame /></div></LanguageProvider>;
}
