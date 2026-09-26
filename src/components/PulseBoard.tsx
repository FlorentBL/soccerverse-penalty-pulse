'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useChannelStore } from '@xayaarcade/sdk';
import { useLanguage } from './LanguageProvider';
import { submitPulseInput } from '@/hooks/use-pulse-input';
import type { PulseState } from '@/lib/pulse/codec';
import { canReach, goalkeeperRating, ratingTier, scoringTargetCount, scoringTargets, shootingRating, tierUsed, validReach } from '@/lib/pulse/codec';
import { featuredPlayers, findPlayerName } from '@/lib/pulse/players';
import { keeperChoice, type PulseInput } from '@/lib/pulse/channel';
import KeeperFigure from './KeeperFigure';
import PulseRules, { rulesCopy } from './PulseRules';
import './PulseBoard.css';

const labels = ['left', 'centre', 'right'] as const;
const heights = ['high', 'middle', 'low'] as const;
interface PulseBoardProps {
  localPlayerIndex: number;
  previewState?: PulseState;
  onPreviewInput?: (input: PulseInput) => Promise<boolean>;
}
interface ShotReplay {
  kick: number;
  guard: number;
  result: number;
  style: CSSProperties;
}
export default function PulseBoard({ localPlayerIndex, previewState, onPreviewInput }: PulseBoardProps) {
  const { locale, t } = useLanguage();
  const raw = useChannelStore(s => s.boardState) as PulseState | null;
  const channelId = useChannelStore(s => s.channelId);
  const candidate = previewState ?? raw;
  const game = candidate && Array.isArray(candidate.goals) && candidate.goals.length === 2 ? candidate : null;
  const preview = previewState !== undefined;
  const [guard, setGuard] = useState<number | null>(null);
  const [lockedGuard, setLockedGuard] = useState<number | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [aim, setAim] = useState<number | null>(null);
  const [selectedShooter, setSelectedShooter] = useState<number | null>(null);
  const [selectedKeeper, setSelectedKeeper] = useState<number | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const [lookupShooter, setLookupShooter] = useState('');
  const [lookupKeeper, setLookupKeeper] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const arenaRef = useRef<HTMLElement>(null);
  const seenKick = useRef<number | null>(null);
  const [replay, setReplay] = useState<ShotReplay | null>(null);
  const myTurn = game?.turn === localPlayerIndex && game.phase !== 6;
  const picking = myTurn && (game?.phase === 0 || game?.phase === 1);
  const defending = myTurn && game?.phase === 3;
  const shooting = myTurn && game?.phase === 4;
  const shooterSeat = game ? game.kick % 2 : 0;
  const strikerId = game?.pairShooters[shooterSeat] || 0;
  const keeperId = game?.pairKeepers[1 - shooterSeat] || 0;
  const reachNeeded = strikerId > 0 && keeperId > 0 && canReach(keeperId, strikerId);
  const usedShooters = game && game.kick < 6 ? game.usedShooters[localPlayerIndex] : [];
  const usedKeepers = game && game.kick < 6 ? game.usedKeepers[localPlayerIndex] : [];

  useEffect(() => {
    setGuard(null); setReach(null); setLockedGuard(null); setAim(null);
    setSelectedShooter(null); setSelectedKeeper(null);
    setBusy(false); setError('');
  }, [game?.turnCount]);
  useLayoutEffect(() => {
    // A mobile player often scrolls through the picker. Show the score and goal
    // again when the next move arrives, including the opponent's move.
    if (game && rootRef.current) rootRef.current.scrollTop = 0;
  }, [game?.turnCount]);
  useEffect(() => {
    if (!preview && game?.phase === 3 && game.turn === localPlayerIndex) {
      const saved = keeperChoice(channelId, localPlayerIndex, game.kick);
      setLockedGuard(saved?.lane ?? null); setGuard(saved?.lane ?? null); setReach(saved?.reach === 255 ? null : saved?.reach ?? null);
    }
  }, [channelId, game?.phase, game?.kick, game?.turn, localPlayerIndex, preview]);
  useEffect(() => {
    const ids = picking ? [selectedShooter, selectedKeeper] : [strikerId, keeperId];
    let live = true;
    for (const id of ids) if (id && !playerNames[id])
      void findPlayerName(id).then(name => {
        if (live && name) setPlayerNames(previous => ({ ...previous, [id]: name }));
      }).catch(() => {});
    return () => { live = false; };
  }, [picking, selectedShooter, selectedKeeper, strikerId, keeperId, playerNames]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => { setBusy(false); setError(t.slow); }, 15000);
    return () => window.clearTimeout(timer);
  }, [busy, t]);
  useLayoutEffect(() => {
    if (!game) return;
    const previousKick = seenKick.current;
    seenKick.current = game.kick;
    if (previousKick === null || game.kick <= previousKick) {
      if (previousKick !== null && game.kick < previousKick) setReplay(null);
      return;
    }
    // The resolved kick advances only after the defender's reveal. Never animate
    // from the pending shot phase, where the keeper choice is still secret.
    if (game.lastShot > 8 || game.lastGuard > 8 || game.lastResult < 1 || game.lastResult > 3) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const arena = arenaRef.current;
    const target = arena?.querySelector<HTMLElement>(`[data-zone="${game.lastShot}"]`);
    const arenaBox = arena?.getBoundingClientRect();
    const targetBox = target?.getBoundingClientRect();
    if (!arena || !arenaBox || !targetBox) return;
    const spotBox = arena.querySelector('.pulse-spot')?.getBoundingClientRect();
    const startX = arenaBox.width / 2;
    // The spot is hidden in the compact picker layout; use its pitch position there.
    const startY = spotBox?.height ? spotBox.top + spotBox.height / 2 - arenaBox.top : arenaBox.height - 33;
    const impactX = targetBox.left + targetBox.width / 2 - arenaBox.left;
    const impactY = targetBox.top + targetBox.height / 2 - arenaBox.top;
    const goalBox = arena.querySelector('.pulse-goal')?.getBoundingClientRect();
    const endX = game.lastResult === 3 && goalBox
      ? game.lastShot % 3 === 0 ? goalBox.left - arenaBox.left - 45
        : game.lastShot % 3 === 2 ? goalBox.right - arenaBox.left + 45 : impactX
      : impactX;
    const endY = game.lastResult === 3
      ? game.lastShot % 3 === 1 && goalBox ? goalBox.top - arenaBox.top - 48 : impactY - 18
      : impactY + (game.lastResult === 1 ? 14 : 0);
    const dx = impactX - startX;
    const dy = impactY - startY;
    setReplay({
      kick: game.kick, guard: game.lastResult === 2 && game.lastReach === game.lastShot ? game.lastShot : game.lastGuard, result: game.lastResult,
      style: {
        '--shot-start-x': `${startX}px`, '--shot-start-y': `${startY}px`,
        '--shot-impact-x': `${impactX}px`, '--shot-impact-y': `${impactY}px`,
        '--shot-end-x': `${endX}px`, '--shot-end-y': `${endY}px`,
        '--shot-trail-length': `${Math.hypot(dx, dy)}px`,
        '--shot-trail-angle': `${Math.atan2(dy, dx)}rad`,
      } as CSSProperties,
    });
  }, [game?.kick, game?.lastShot, game?.lastGuard, game?.lastResult]);
  useEffect(() => {
    if (!replay) return;
    const timer = window.setTimeout(() => setReplay(current => current?.kick === replay.kick ? null : current), 1850);
    return () => window.clearTimeout(timer);
  }, [replay]);

  function selectPlayer(id: number, role: 'shoot' | 'save') {
    if (replay) return;
    if (shootingRating(id) === null || goalkeeperRating(id) === null) { setError(t.playerMissing); return; }
    const rating = role === 'shoot' ? shootingRating(id) : goalkeeperRating(id);
    if (ratingTier(rating) < 0) { setError(t.tierInvalid); return; }
    if (tierUsed(role === 'shoot' ? usedShooters : usedKeepers, id, role)) { setError(t.tierUsed); return; }
    if (id === (role === 'shoot' ? selectedKeeper : selectedShooter)) { setError(t.distinctPlayers); return; }
    setError('');
    if (role === 'shoot') setSelectedShooter(id);
    else setSelectedKeeper(id);
  }
  async function send() {
    if (!game || !myTurn || busy || replay) return;
    const input = (game.phase === 0 || game.phase === 1) && selectedShooter !== null && selectedKeeper !== null
      ? { type: 'pick' as const, kick: game.kick, shooterId: selectedShooter, keeperId: selectedKeeper }
      : game.phase === 3 && guard !== null && (!reachNeeded || reach !== null)
      ? { type: 'guard' as const, kick: game.kick, lane: guard, reach: reachNeeded ? reach! : 255 }
      : game.phase === 4 && aim !== null
        ? { type: 'shot' as const, kick: game.kick, lane: aim }
        : null;
    if (!input) return;
    setBusy(true); setError('');
    try {
      if (!await (onPreviewInput ?? submitPulseInput)(input)) { setBusy(false); setError(t.disconnected); }
    } catch { setBusy(false); setError(t.disconnected); }
  }
  const finished = game?.phase === 6;
  const result = game?.lastResult === 1 ? t.goal : game?.lastResult === 2 ? t.saved : game?.lastResult === 3 ? t.missed : '—';
  const instructions = !game ? t.waiting :
    finished ? game.winner === -2 ? t.draw : preview ? `P${game.winner + 1} ${t.wins}` : game.winner === localPlayerIndex ? t.yourWin : t.rivalWin :
    (game.phase === 2 || game.phase === 5) ? t.revealPrompt : picking ? t.pickPrompt : defending ? t.guardPrompt.replace('{count}', String(scoringTargetCount(strikerId))) : shooting ? t.shotPrompt : t.waiting;
  const displayShooterId = picking ? selectedShooter : game?.pairShooters[localPlayerIndex] || null;
  const allowed = picking && displayShooterId ? scoringTargets(displayShooterId) : strikerId ? scoringTargets(strikerId) : [];
  const roleLabel = picking ? t.lineupLabel : defending ? t.keeper : shooting ? t.striker : t.result;
  const phaseLabel = replay ? t.result : preview && (picking || defending || shooting) ? `P${localPlayerIndex + 1} / ${roleLabel}` : roleLabel;
  const mobileHint = picking ? t.mobilePick : defending ? reachNeeded && guard !== null ? t.mobileSecondZone : t.mobileKeeper
    : shooting ? t.mobileAim : finished ? t.result : t.waiting;
  const roleOrder = localPlayerIndex === 0 ? (['shoot', 'save'] as const) : (['save', 'shoot'] as const);
  const activeRole = defending ? 'save' : shooting ? 'shoot' : null;
  const stepNumber = picking ? '01' : activeRole === roleOrder[0] ? '02' : activeRole === roleOrder[1] ? '03' : 'FT';
  const lastKeeper = game && game.kick > 0 && (finished || game.phase === 0 && selectedShooter === null) && game.lastGuard <= 8 ?
    game.lastResult === 2 && game.lastReach === game.lastShot ? game.lastShot : game.lastGuard : null;
  const keeperSpot = replay ? replay.guard : defending ? guard ?? 4 : lastKeeper;
  const shownKick = replay ? replay.kick - 1 : game?.kick ?? 0;
  const shownGoals = game ? [...game.goals] : [0, 0];
  if (replay?.result === 1) {
    const scorer = (replay.kick - 1) % 2;
    shownGoals[scorer] = Math.max(0, shownGoals[scorer] - 1);
  }
  const extra = shownKick >= 6;
  const progress = extra ? shownKick - 6 : shownKick;
  const progressTotal = extra ? 2 : 6;
  const progressDone = extra ? finished && !replay && progress % 2 === 0 ? 2 : progress % 2 : progress;
  const extraRound = Math.floor(progress / 2) + (finished && !replay && progress % 2 === 0 && progress > 0 ? 0 : 1);
  const regulationKick = finished && !replay ? Math.max(1, Math.min(shownKick, 6)) : Math.min(shownKick + 1, 6);

  return <main ref={rootRef} className={'pulse-root' + (replay ? ' pulse-replaying' : '')}>
    <header className="pulse-top">
      <div className="pulse-brand"><span className="pulse-brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <div><span className="pulse-kicker">{t.subtitle}</span><h1>{t.title}</h1></div></div>
      <span className="pulse-free"><i aria-hidden="true" />{preview ? t.localDemo : t.playFree}</span>
    </header>
    <div className="pulse-score">
      <div className={'pulse-score-side ' + (!preview && localPlayerIndex === 0 ? 'mine' : '')}><small>{preview ? 'P1' : localPlayerIndex === 0 ? t.you : t.rival}</small><strong>{shownGoals[0]}</strong></div>
      <div className="pulse-round"><span>{extra ? t.suddenDeath : t.round + ' ' + regulationKick} <em>{extra ? t.extraRound + ' ' + extraRound : t.of + ' 6'}</em></span>
        <div className="pulse-dots">{Array.from({ length: progressTotal }, (_, i) => <i key={i} className={i < progressDone ? 'done' : !finished && i === progressDone ? 'current' : ''} />)}</div>
        <button type="button" className="pulse-rules-trigger" onClick={() => setRulesOpen(true)}>{rulesCopy[locale].button} <span aria-hidden="true">↗</span></button>
      </div>
      <div className={'pulse-score-side pulse-score-away ' + (!preview && localPlayerIndex === 1 ? 'mine' : '')}><small>{preview ? 'P2' : localPlayerIndex === 1 ? t.you : t.rival}</small><strong>{shownGoals[1]}</strong></div>
    </div>
    <section className="pulse-arena" aria-label="Penalty goal" ref={arenaRef}>
      <div className="pulse-arena-caption"><span className="pulse-live-dot" aria-hidden="true" />
        <span className="pulse-caption-desktop">{phaseLabel}</span><span className="pulse-caption-mobile">{mobileHint}</span></div>
      {allowed.length > 0 && (picking || defending || shooting) && <div className="pulse-goal-legend"><i aria-hidden="true" />{t.validLanes}</div>}
      <div className="pulse-goal-wrap">
        <div className="pulse-goal-head">{labels.map(key => <span key={key}>{t[key]}</span>)}</div>
        <div className={'pulse-goal' + (replay?.result === 1 ? ' pulse-goal-scored' : '')}>
        {Array.from({ length: 9 }, (_, lane) => {
          const key = labels[lane % 3];
          const height = heights[Math.floor(lane / 3)];
          const chosen = defending ? guard === lane || reach === lane : shooting ? aim === lane : false;
          const last = !replay && (finished || game?.phase === 0);
          const keeperHere = last && (game?.lastGuard === lane || game?.lastReach === lane);
          const ballHere = last && game?.lastShot === lane;
          const marker = keeperHere ? 'keeper' : ballHere ? game?.lastResult === 3 ? 'missed' : 'ball' : '';
          return <button type="button" key={lane} className={'pulse-zone ' + (chosen ? 'selected ' : '') + (allowed.includes(lane) && (picking || defending || shooting) ? 'scoring ' : '') + (defending && reach === lane ? 'pulse-reach ' : '') + (defending && guard === lane ? 'pulse-primary ' : '') + marker}
            disabled={(!defending && !shooting) || busy || !!replay || (defending && lockedGuard !== null)}
            data-zone={lane} aria-label={`${t[height]} ${t[key]}`} aria-pressed={chosen}
            onClick={() => defending ? (guard === null || !validReach(keeperId, strikerId, guard, lane) ? (setGuard(lane), setReach(null)) : setReach(lane)) : setAim(lane)}>
            <span className="pulse-zone-no" aria-hidden="true">0{lane + 1}</span>
            <span className="pulse-zone-target" aria-hidden="true">{ballHere && !keeperHere ? '●' : defending && reach === lane ? '◎' : chosen ? '✦' : '+'}</span>
          </button>;
        })}
        {keeperSpot !== null && <KeeperFigure lane={keeperSpot} ready={defending && guard === null} replay={!!replay}
          caught={!replay && lastKeeper !== null && game?.lastResult === 2 && game.lastShot === lastKeeper} />}
        </div>
      </div>
      <div className="pulse-spot"><span className="pulse-ball" aria-hidden="true" /></div>
      {replay && <div className={'pulse-replay pulse-replay-' + (replay.result === 1 ? 'goal' : replay.result === 2 ? 'saved' : 'missed')}
        style={replay.style} aria-hidden="true" data-testid="pulse-shot-replay">
        <span className="pulse-flight-trail" /><span className="pulse-flight-ball" />
        <span className="pulse-impact-ring" />
        <strong className="pulse-replay-result">{replay.result === 1 ? t.goal : replay.result === 2 ? t.saved : t.missed}</strong>
      </div>}
      <div className="pulse-pitch-arc" />
      <div className="pulse-pitch-line" />
    </section>
    <section className="pulse-console">
      <div className="pulse-step"><span className="pulse-step-index">{stepNumber}</span>
        <div><small>{phaseLabel}</small><p aria-live="polite">{instructions}</p></div></div>
      {defending && <div className="pulse-target-intel"><span>{t.scoringZoneList}</span>
        <strong>{[...allowed].sort((a, b) => a - b).map(zone => String(zone + 1).padStart(2, '0')).join(' · ')}</strong></div>}
      {(picking || defending || shooting) && <div className="pulse-role-plan">
        <span>{t.twoPlayersTwoRoles}</span>
        <ol>{roleOrder.map((role, index) => <li key={role} className={activeRole === role ? 'active' : ''}
          aria-current={activeRole === role ? 'step' : undefined}>
          <b>{String(index + 1).padStart(2, '0')}</b>{role === 'shoot' ? t.shootRole : t.saveRole}
        </li>)}</ol>
      </div>}
      {picking && <div className="pulse-picker">
        <p className="pulse-tier-rule">{t.tierRule}</p>
        {(['striker', 'keeper'] as const).map(role => {
          const isShooter = role === 'striker';
          const selected = isShooter ? selectedShooter : selectedKeeper;
          const selectedName = selected ? playerNames[selected] ?? featuredPlayers.find(p => p.id === selected)?.name ?? '#' + selected : t.chooseOne;
          const usedIds = isShooter ? usedShooters : usedKeepers;
          const lookup = isShooter ? lookupShooter : lookupKeeper;
          return <section className="pulse-roster" key={role} aria-label={isShooter ? t.striker : t.keeper}>
            <div className="pulse-roster-head"><div><span>{isShooter ? '01' : '02'}</span><strong>{isShooter ? t.striker : t.keeper}</strong></div>
              <small>{selectedName}</small></div>
            <div className="pulse-roster-cards">{featuredPlayers.filter(p => p.role === role).map(p => {
              const rating = isShooter ? shootingRating(p.id) : goalkeeperRating(p.id);
              const used = tierUsed(usedIds, p.id, isShooter ? 'shoot' : 'save');
              return <button type="button" key={p.id} disabled={!!replay || used || p.id === (isShooter ? selectedKeeper : selectedShooter)}
                className={selected === p.id ? 'active' : ''} onClick={() => selectPlayer(p.id, isShooter ? 'shoot' : 'save')}>
                <span className="pulse-card-band">{['90+', '75–89', '55–74'][ratingTier(rating)]}</span>
                <strong>{p.name}</strong><b>{rating}</b>{used && <em>{t.tierSpent}</em>}
              </button>;
            })}</div>
            <label htmlFor={'pulse-player-' + role}>{t.playerId}</label>
            <div className="pulse-search"><input id={'pulse-player-' + role} type="number" min="1" max="523571" inputMode="numeric"
              value={lookup} onChange={e => isShooter ? setLookupShooter(e.target.value) : setLookupKeeper(e.target.value)} placeholder="ID" />
              <button type="button" disabled={!!replay} onClick={() => selectPlayer(Number(lookup), isShooter ? 'shoot' : 'save')}>{t.search}</button></div>
          </section>;
        })}
      </div>}
      {(defending || shooting) && <div className="pulse-matchup"><div><span>{t.striker}</span><b>{playerNames[strikerId] ?? featuredPlayers.find(p => p.id === strikerId)?.name ?? '#' + strikerId}</b><small>{t.shootingRating} {shootingRating(strikerId)} · {scoringTargetCount(strikerId)}/9</small></div><strong>VS</strong><div><span>{t.keeper}</span><b>{playerNames[keeperId] ?? featuredPlayers.find(p => p.id === keeperId)?.name ?? '#' + keeperId}</b><small>{t.keeper} {goalkeeperRating(keeperId)} · {reachNeeded ? '2' : '1'}/9</small></div></div>}
      {defending && reachNeeded && <p className="pulse-reach-hint">{goalkeeperRating(keeperId)! >= 90 ? t.reachAnyPrompt : t.reachPrompt} {guard !== null && <button type="button" onClick={() => { setGuard(null); setReach(null); }}>{t.resetPosition}</button>}</p>}
      {(picking || defending || shooting) && <button type="button" className="pulse-action" disabled={busy || !!replay || picking && (selectedShooter === null || selectedKeeper === null) || defending && (guard === null || reachNeeded && reach === null) || shooting && aim === null}
        onClick={() => void send()}>{picking ? t.confirmPlayer : defending ? t.dive : t.shoot}<span aria-hidden="true">↗</span></button>}
      {!!game?.kick && !replay && <div className="pulse-last" aria-live="polite"><span>{t.result}</span><strong>{result}</strong></div>}
      {error && <p role="alert" className="pulse-error">{error}</p>}
    </section>
    <footer>{t.snapshot}</footer>
    {rulesOpen && <PulseRules onClose={() => setRulesOpen(false)} />}
  </main>;
}
