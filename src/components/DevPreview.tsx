'use client';

import { useRef, useState } from 'react';
import { useLanguage } from './LanguageProvider';
import PulseBoard from './PulseBoard';
import type { PulseInput } from '@/lib/pulse/channel';
import { advancePreview, initialPreviewState, type PreviewGuard } from '@/lib/pulse/dev-preview';

export default function DevPreview({ onExit }: { onExit: () => void }) {
  const { t } = useLanguage();
  const [game, setGame] = useState(initialPreviewState);
  const [resetKey, setResetKey] = useState(0);
  const keeperLane = useRef<PreviewGuard | null>(null);

  async function submit(input: PulseInput): Promise<boolean> {
    const next = advancePreview(game, input, keeperLane.current);
    if (!next) return false;
    keeperLane.current = next.keeperChoice;
    setGame(next.state);
    return true;
  }

  function reset() {
    keeperLane.current = null;
    setGame(initialPreviewState());
    setResetKey(key => key + 1);
  }

  return <div className="pulse-preview-shell">
    <div className="pulse-preview-toolbar">
      <span><i aria-hidden="true" />{t.localDemo}<small>{t.previewNoWallet}</small></span>
      <div><button type="button" onClick={reset}>{t.resetDemo}</button>
        <button type="button" onClick={onExit}>{t.exitDemo}</button></div>
    </div>
    <PulseBoard key={resetKey} previewState={game} onPreviewInput={submit}
      localPlayerIndex={game.phase === 6 ? (game.kick - 1) % 2 : game.turn} />
  </div>;
}
