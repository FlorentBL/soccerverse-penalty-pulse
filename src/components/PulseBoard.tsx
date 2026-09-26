'use client';

import { useEffect, useState } from 'react';
import { useChannelStore } from '@xayaarcade/sdk';
import { useLanguage } from './LanguageProvider';
import { submitPulseInput } from '@/hooks/use-pulse-input';
import type { PulseState } from '@/lib/pulse/codec';
import { primaryLane, secondaryLane } from '@/lib/pulse/codec';
import { featuredPlayers, findPlayerName } from '@/lib/pulse/players';
import { keeperChoice, type PulseInput } from '@/lib/pulse/channel';
import './PulseBoard.css';

const labels = ['left', 'centre', 'right'] as const;
interface PulseBoardProps {
  localPlayerIndex: number;
  previewState?: PulseState;
  onPreviewInput?: (input: PulseInput) => Promise<boolean>;
}
export default function PulseBoard({ localPlayerIndex, previewState, onPreviewInput }: PulseBoardProps) {
  const { t } = useLanguage();
  const raw = useChannelStore(s => s.boardState) as PulseState | null;
  const channelId = useChannelStore(s => s.channelId);
  const candidate = previewState ?? raw;
  const game = candidate && Array.isArray(candidate.goals) && candidate.goals.length === 2 ? candidate : null;
  const preview = previewState !== undefined;
  const [guard, setGuard] = useState<number | null>(null);
  const [lockedGuard, setLockedGuard] = useState<number | null>(null);
  const [aim, setAim] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const myTurn = game?.turn === localPlayerIndex && game.phase !== 4;
  const picking = myTurn && game?.phase === 0;
  const defending = myTurn && game?.phase === 1;
  const shooting = myTurn && game?.phase === 2;
  const used = game?.used[localPlayerIndex] ?? [];

  useEffect(() => {
    setGuard(null); setLockedGuard(null); setAim(null); setPlayerId(null); setPlayerName('');
    setBusy(false); setError('');
  }, [game?.turnCount]);
  useEffect(() => {
    if (!preview && game?.phase === 1 && game.turn === localPlayerIndex) {
      const saved = keeperChoice(channelId, localPlayerIndex, game.kick);
      setLockedGuard(saved); setGuard(saved);
    }
  }, [channelId, game?.phase, game?.kick, game?.turn, localPlayerIndex, preview]);
  useEffect(() => {
    if ((game?.phase !== 1 && game?.phase !== 2) || !game.pendingPlayer) return;
    let live = true;
    void findPlayerName(game.pendingPlayer).then(name => { if (live) setPlayerName(name ?? '#' + game.pendingPlayer); });
    return () => { live = false; };
  }, [game?.phase, game?.pendingPlayer]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => { setBusy(false); setError(t.slow); }, 15000);
    return () => window.clearTimeout(timer);
  }, [busy, t]);

  async function selectPlayer(id: number) {
    if (used.includes(id)) { setError(t.cannotReuse); return; }
    setError('');
    try {
      const name = await findPlayerName(id);
      if (!name) { setError(t.playerMissing); return; }
      setPlayerId(id); setPlayerName(name);
    } catch { setError(t.lookupFailed); }
  }
  async function send() {
    if (!game || !myTurn || busy) return;
    const input = game.phase === 0 && playerId !== null
      ? { type: 'pick' as const, kick: game.kick, playerId }
      : game.phase === 1 && guard !== null
      ? { type: 'guard' as const, kick: game.kick, lane: guard }
      : game.phase === 2 && aim !== null
        ? { type: 'shot' as const, kick: game.kick, lane: aim }
        : null;
    if (!input) return;
    setBusy(true); setError('');
    try {
      if (!await (onPreviewInput ?? submitPulseInput)(input)) { setBusy(false); setError(t.disconnected); }
    } catch { setBusy(false); setError(t.disconnected); }
  }
  const finished = game?.phase === 4;
  const result = game?.lastResult === 1 ? t.goal : game?.lastResult === 2 ? t.saved : game?.lastResult === 3 ? t.missed : '—';
  const instructions = !game ? t.waiting :
    finished ? game.winner === -2 ? t.draw : preview ? `P${game.winner + 1} ${t.wins}` : game.winner === localPlayerIndex ? t.yourWin : t.rivalWin :
    game.phase === 3 ? t.revealPrompt : picking ? t.pickPrompt : defending ? t.guardPrompt : shooting ? t.shotPrompt : t.waiting;
  const displayId = defending || shooting ? game?.pendingPlayer ?? null : playerId;
  const allowed = displayId === null ? [] : [primaryLane(displayId), secondaryLane(displayId)];
  const roleLabel = defending ? t.keeper : picking || shooting ? t.striker : t.result;
  const phaseLabel = preview && (picking || defending || shooting) ? `P${localPlayerIndex + 1} / ${roleLabel}` : roleLabel;

  return <main className="pulse-root">
    <header className="pulse-top">
      <div className="pulse-brand"><span className="pulse-brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <div><span className="pulse-kicker">{t.subtitle}</span><h1>{t.title}</h1></div></div>
      <span className="pulse-free"><i aria-hidden="true" />{preview ? t.localDemo : t.playFree}</span>
    </header>
    <div className="pulse-score">
      <div className={'pulse-score-side ' + (!preview && localPlayerIndex === 0 ? 'mine' : '')}><small>{preview ? 'P1' : localPlayerIndex === 0 ? t.you : t.rival}</small><strong>{game?.goals[0] ?? 0}</strong></div>
      <div className="pulse-round"><span>{t.round} {Math.min((game?.kick ?? 0) + 1, 6)} <em>{t.of} 6</em></span>
        <div className="pulse-dots">{Array.from({ length: 6 }, (_, i) => <i key={i} className={i < (game?.kick ?? 0) ? 'done' : i === game?.kick ? 'current' : ''} />)}</div>
      </div>
      <div className={'pulse-score-side pulse-score-away ' + (!preview && localPlayerIndex === 1 ? 'mine' : '')}><small>{preview ? 'P2' : localPlayerIndex === 1 ? t.you : t.rival}</small><strong>{game?.goals[1] ?? 0}</strong></div>
    </div>
    <section className="pulse-arena" aria-label="Penalty goal">
      <div className="pulse-arena-caption"><span className="pulse-live-dot" aria-hidden="true" />{phaseLabel}</div>
      <div className="pulse-floodlight left-light" /><div className="pulse-floodlight right-light" />
      <div className="pulse-goal">
        {labels.map((key, lane) => {
          const chosen = defending ? guard === lane : shooting ? aim === lane : false;
          const last = finished || game?.phase === 0;
          const marker = last && game?.lastGuard === lane ? 'keeper' : last && game?.lastShot === lane ? 'ball' : '';
          return <button type="button" key={key} className={'pulse-zone ' + (chosen ? 'selected ' : '') + marker}
            disabled={(!defending && !shooting) || busy || (defending && lockedGuard !== null && lockedGuard !== lane)}
            aria-label={t[key]} aria-pressed={chosen}
            onClick={() => defending ? setGuard(lane) : setAim(lane)}>
            <span className="pulse-zone-no" aria-hidden="true">0{lane + 1}</span>
            <span className="pulse-zone-target" aria-hidden="true">{marker === 'keeper' ? 'GK' : marker === 'ball' ? '●' : chosen ? '✦' : '+'}</span>
            <span className="pulse-zone-label" aria-hidden="true">{t[key]}</span>
          </button>;
        })}
      </div>
      <div className="pulse-spot"><span className="pulse-ball" aria-hidden="true" /></div>
      <div className="pulse-pitch-arc" />
      <div className="pulse-pitch-line" />
    </section>
    <section className="pulse-console">
      <div className="pulse-step"><span className="pulse-step-index">{game?.phase === 0 ? '01' : game?.phase === 1 ? '02' : game?.phase === 2 ? '03' : game?.phase === 3 ? '04' : 'FT'}</span>
        <div><small>{phaseLabel}</small><p aria-live="polite">{instructions}</p></div></div>
      {picking && <div className="pulse-picker">
        <label htmlFor="pulse-player-id">{t.playerId}</label>
        <div className="pulse-search"><input id="pulse-player-id" type="number" min="1" max="523571" inputMode="numeric" value={lookup}
          onChange={e => setLookup(e.target.value)} placeholder="1100" />
          <button type="button" onClick={() => void selectPlayer(Number(lookup))}>{t.search}</button></div>
        <div className="pulse-featured"><small>{t.featured}</small><div>{featuredPlayers.map((p, index) =>
          <button type="button" key={p.id} aria-label={p.name} disabled={used.includes(p.id)} className={playerId === p.id ? 'active' : ''}
            onClick={() => void selectPlayer(p.id)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{p.name}</button>)}</div></div>
      </div>}
      {displayId !== null && (picking || defending || shooting) && <div className="pulse-player"><div className="pulse-player-monogram" aria-hidden="true">SV</div><div className="pulse-player-info"><strong>{playerName || '#' + displayId}</strong><span>#{displayId}</span>
        <small>{t.validLanes}: <b>{allowed.map(x => t[labels[x]]).join('  +  ')}</b></small></div></div>}
      {(picking || defending || shooting) && <button type="button" className="pulse-action" disabled={busy || picking && playerId === null || defending && guard === null || shooting && aim === null}
        onClick={() => void send()}>{picking ? t.confirmPlayer : defending ? t.dive : t.shoot}<span aria-hidden="true">↗</span></button>}
      {!!game?.kick && <div className="pulse-last"><span>{t.result}</span><strong>{result}</strong></div>}
      {error && <p role="alert" className="pulse-error">{error}</p>}
    </section>
    <footer>{t.snapshot}</footer>
  </main>;
}
