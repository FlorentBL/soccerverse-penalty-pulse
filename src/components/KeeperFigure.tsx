import type { CSSProperties } from 'react';

interface KeeperFigureProps {
  lane: number;
  ready?: boolean;
  caught?: boolean;
  replay?: boolean;
}

/** A single keeper sprite follows the defender's nine-zone choice. */
export default function KeeperFigure({ lane, ready = false, caught = false, replay = false }: KeeperFigureProps) {
  const column = lane % 3;
  const row = Math.floor(lane / 3);
  const handY = row === 0 ? 12 : row === 1 ? 47 : 79;
  const elbowY = row === 0 ? 29 : row === 1 ? 49 : 66;
  const handX = row === 1 ? 5 : 12;

  return <div
    className={`pulse-keeper pulse-keeper-row-${row} pulse-keeper-col-${column}${ready ? ' pulse-keeper-ready' : ''}${replay ? ' pulse-keeper-diving' : ''}`}
    data-testid="pulse-keeper" data-lane={lane} aria-hidden="true"
    style={{ left: `${(column + 0.5) * 100 / 3}%`, top: `${(row + 0.5) * 100 / 3}%`,
      '--keeper-end-x': `${(column + 0.5) * 100 / 3}%`, '--keeper-end-y': `${(row + 0.5) * 100 / 3}%` } as CSSProperties}>
    <span className="pulse-keeper-aura" />
    <svg viewBox="0 0 100 108" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="pulse-keeper-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb68a" /><stop offset="0.48" stopColor="#ff735c" /><stop offset="1" stopColor="#c6334a" />
        </linearGradient>
        <linearGradient id="pulse-keeper-glove" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#bdffd2" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="102" rx="32" ry="5" fill="#001611" opacity=".5" />
      <path d="M39 70 L31 94 L25 99 M61 70 L69 94 L75 99" fill="none" stroke="#173331" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 93 L24 101 L15 102 M71 93 L76 101 L85 102" fill="none" stroke="#e8fae9" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M36 45 Q23 ${elbowY} ${handX} ${handY} M64 45 Q77 ${elbowY} ${100 - handX} ${handY}`} fill="none" stroke="#dc604e" strokeWidth="12" strokeLinecap="round" />
      <path d={`M36 45 Q23 ${elbowY} ${handX} ${handY} M64 45 Q77 ${elbowY} ${100 - handX} ${handY}`} fill="none" stroke="#ffc59d" strokeWidth="3" strokeLinecap="round" opacity=".56" />
      <circle cx={handX} cy={handY} r="9" fill="url(#pulse-keeper-glove)" stroke="#25564b" strokeWidth="2" />
      <circle cx={100 - handX} cy={handY} r="9" fill="url(#pulse-keeper-glove)" stroke="#25564b" strokeWidth="2" />
      <path d="M35 39 Q50 32 65 39 L69 70 Q50 78 31 70 Z" fill="url(#pulse-keeper-shirt)" stroke="#ffe0b0" strokeWidth="2" />
      <path d="M34 68 Q50 74 66 68 L64 79 Q50 83 36 79 Z" fill="#102d2b" stroke="#efb891" strokeWidth="1.5" />
      <rect x="45" y="32" width="10" height="12" rx="4" fill="#a96248" />
      <ellipse cx="50" cy="24" rx="11" ry="13" fill="#c7845e" stroke="#ffcf9e" strokeWidth="1.5" />
      <path d="M39 22 Q38 9 49 9 Q62 10 62 22 Q56 16 50 17 Q43 14 39 22 Z" fill="#172b27" />
      <path d="M41 24 Q50 29 59 24" fill="none" stroke="#ffe0aa" strokeWidth="1" opacity=".6" />
      <text x="50" y="62" fill="#fff8e4" fontSize="19" fontWeight="900" textAnchor="middle" fontFamily="Arial, sans-serif">1</text>
      {caught && <g className="pulse-keeper-catch"><circle cx="50" cy="48" r="9" fill="#f8fff2" stroke="#15352b" strokeWidth="2" /><path d="M50 42 L55 46 L53 52 L47 52 L45 46 Z" fill="#24483e" /></g>}
    </svg>
  </div>;
}
