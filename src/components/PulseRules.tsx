'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from './LanguageProvider';
import type { Locale } from '@/lib/i18n';

type RulesCopy = {
  button: string; title: string; close: string; intro: string;
  steps: { number: string; title: string; body: string }[];
  shotTitle: string; shotText: string; keeperTitle: string; keeperText: string;
  low: string; middle: string; elite: string; finalNote: string;
};

export const rulesCopy: Record<Locale, RulesCopy> = {
  en: {
    button: 'RULES', title: 'HOW TO PLAY', close: 'Close rules',
    intro: 'Two players. Five penalties each. Switch attacker and defender after every kick.',
    steps: [
      { number: '01', title: 'Choose a player', body: 'The attacker chooses one of their five FC shooters. The defender sees the shooter and chooses one of their five GK keepers. Each team has different players: one in each rating band. Each card is used once per role during regulation.' },
      { number: '02', title: 'Read the goal', body: 'The nine zones are numbered. Both players see the same green scoring zones. Stronger shooters have more green zones.' },
      { number: '03', title: 'Position and shoot', body: 'The defender secretly places the goalkeeper in one or two touching zones, according to the keeper and shooter ratings. Then the attacker aims at a green zone. A covered shot is saved; otherwise it scores.' },
      { number: '04', title: 'Finish the shootout', body: 'Players swap roles after each shot. The match can end early when a comeback is impossible. A tie after five shots each leads to paired sudden death, where cards may be reused.' },
    ],
    shotTitle: 'SHOOTER · GREEN ZONES', shotText: 'Official Soccerverse shooting rating determines the number of scoring zones.',
    keeperTitle: 'GOALKEEPER · COVERAGE', keeperText: 'A second zone must touch the first. Its availability depends on both ratings.',
    low: '1 zone', middle: '2 zones sharing an edge if shooter has enough green zones', elite: '2 touching zones, edge or corner if shooter has 5+ green zones',
    finalNote: 'The 20 displayed cards are fixed from pinned Soccerverse ratings and primary FC/GK positions. Arbitrary IDs are rejected. Ownership is not required. Zone patterns and coverage thresholds are Arcade rules.',
  },
  fr: {
    button: 'RÈGLES', title: 'COMMENT JOUER', close: 'Fermer les règles',
    intro: 'Deux joueurs. Cinq penalties chacun. On échange les rôles après chaque tir.',
    steps: [
      { number: '01', title: 'Choisissez un joueur', body: 'Le tireur choisit un de ses cinq FC. Le défenseur voit ce joueur et choisit un de ses cinq gardiens GK. Chaque équipe a des joueurs différents : un dans chaque niveau. Chaque carte sert une fois par rôle pendant la séance réglementaire.' },
      { number: '02', title: 'Lisez la cage', body: 'Les neuf cases sont numérotées. Les deux joueurs voient les mêmes cases vertes. Un meilleur tireur dispose de plus de cases vertes.' },
      { number: '03', title: 'Placez et tirez', body: 'Le défenseur place secrètement son gardien sur une ou deux cases qui se touchent, selon les notes des deux joueurs. Le tireur vise une case verte. Un tir couvert est arrêté ; sinon, c’est un but.' },
      { number: '04', title: 'Terminez la séance', body: 'Les rôles s’inversent après chaque tir. La partie finit tôt si le score ne peut plus être rattrapé. Après cinq tirs chacun, une égalité mène à la mort subite par paires ; les cartes sont alors réutilisables.' },
    ],
    shotTitle: 'TIREUR · CASES VERTES', shotText: 'La note de tir officielle Soccerverse détermine combien de cases permettent de marquer.',
    keeperTitle: 'GARDIEN · COUVERTURE', keeperText: 'Une deuxième case doit toucher la première. Sa disponibilité dépend des deux notes.',
    low: '1 case', middle: '2 cases voisines par un côté si le tireur a assez de cases vertes', elite: '2 cases qui se touchent, côté ou coin, si le tireur a au moins 5 cases vertes',
    finalNote: 'Les 20 cartes sont fixées selon les notes et postes FC/GK officiels de Soccerverse. Les ID arbitraires sont refusés. Posséder les joueurs n’est pas nécessaire. Les motifs et seuils sont des règles Arcade.',
  },
  it: {
    button: 'REGOLE', title: 'COME SI GIOCA', close: 'Chiudi le regole',
    intro: 'Due giocatori. Cinque rigori a testa. I ruoli si scambiano dopo ogni tiro.',
    steps: [
      { number: '01', title: 'Scegli un giocatore', body: 'Chi attacca sceglie uno dei suoi cinque FC. Il difensore vede il tiratore e sceglie uno dei suoi cinque portieri GK. Le squadre sono diverse, con un giocatore per fascia. Ogni carta si usa una volta per ruolo nei tempi regolamentari.' },
      { number: '02', title: 'Leggi la porta', body: 'Le nove zone sono numerate. Entrambi vedono le stesse zone verdi. Un tiratore migliore ha più zone verdi.' },
      { number: '03', title: 'Posiziona e tira', body: 'Il difensore posiziona di nascosto il portiere su una o due zone che si toccano, secondo i valori. Il tiratore mira a una zona verde. Un tiro coperto è parato; altrimenti è gol.' },
      { number: '04', title: 'Completa la sfida', body: 'I ruoli si scambiano dopo ogni tiro. La partita può finire prima se il recupero è impossibile. Dopo cinque tiri a testa, il pareggio porta all’oltranza; le carte sono riutilizzabili.' },
    ],
    shotTitle: 'TIRATORE · ZONE VERDI', shotText: 'Il valore ufficiale di tiro Soccerverse determina il numero di zone valide.',
    keeperTitle: 'PORTIERE · COPERTURA', keeperText: 'La seconda zona deve toccare la prima e dipende dai due valori.',
    low: '1 zona', middle: '2 zone vicine per lato se il tiratore ha abbastanza zone verdi', elite: '2 zone che si toccano per lato o angolo se il tiratore ha almeno 5 zone verdi',
    finalNote: 'Le 20 carte derivano dai valori e ruoli FC/GK ufficiali Soccerverse. Gli ID arbitrari sono rifiutati. Non è necessario possedere i giocatori. Schemi e soglie sono regole Arcade.',
  },
  es: {
    button: 'REGLAS', title: 'CÓMO JUGAR', close: 'Cerrar reglas',
    intro: 'Dos jugadores. Cinco penaltis cada uno. Se intercambian los roles tras cada tiro.',
    steps: [
      { number: '01', title: 'Elige un jugador', body: 'El atacante elige uno de sus cinco FC. El defensor ve al lanzador y elige uno de sus cinco porteros GK. Los equipos son distintos, con un jugador de cada nivel. Cada carta se usa una vez por rol en la tanda reglamentaria.' },
      { number: '02', title: 'Lee la portería', body: 'Las nueve zonas están numeradas. Ambos ven las mismas zonas verdes. Un mejor lanzador tiene más zonas verdes.' },
      { number: '03', title: 'Coloca y tira', body: 'El defensor coloca al portero en secreto en una o dos zonas que se tocan, según las notas. El atacante apunta a una zona verde. Un tiro cubierto se para; si no, es gol.' },
      { number: '04', title: 'Termina la tanda', body: 'Los roles cambian tras cada tiro. El partido puede acabar antes si remontar es imposible. Tras cinco tiros cada uno, el empate lleva a muerte súbita; las cartas pueden reutilizarse.' },
    ],
    shotTitle: 'LANZADOR · ZONAS VERDES', shotText: 'La nota oficial de tiro Soccerverse determina el número de zonas válidas.',
    keeperTitle: 'PORTERO · COBERTURA', keeperText: 'La segunda zona debe tocar la primera y depende de ambas notas.',
    low: '1 zona', middle: '2 zonas vecinas por un lado si el lanzador tiene suficientes zonas verdes', elite: '2 zonas que se tocan por lado o esquina si el lanzador tiene 5+ zonas verdes',
    finalNote: 'Las 20 cartas proceden de notas y posiciones FC/GK oficiales de Soccerverse. Se rechazan los ID arbitrarios. No es necesario poseer los jugadores. Patrones y umbrales son reglas Arcade.',
  },
  pt: {
    button: 'REGRAS', title: 'COMO JOGAR', close: 'Fechar regras',
    intro: 'Dois jogadores. Cinco penáltis cada. Os papéis trocam após cada remate.',
    steps: [
      { number: '01', title: 'Escolha um jogador', body: 'O atacante escolhe um dos seus cinco FC. O defensor vê o marcador e escolhe um dos seus cinco guarda-redes GK. As equipas são diferentes, com um jogador por nível. Cada carta é usada uma vez por papel no tempo regulamentar.' },
      { number: '02', title: 'Leia a baliza', body: 'As nove zonas estão numeradas. Ambos veem as mesmas zonas verdes. Um melhor marcador tem mais zonas verdes.' },
      { number: '03', title: 'Posicione e remate', body: 'O defensor posiciona o guarda-redes em segredo numa ou duas zonas que se tocam, conforme as notas. O atacante aponta a uma zona verde. Um remate coberto é defendido; caso contrário, é golo.' },
      { number: '04', title: 'Conclua a disputa', body: 'Os papéis trocam após cada remate. O jogo pode acabar cedo se recuperar for impossível. Após cinco remates cada, o empate leva à morte súbita; as cartas podem ser reutilizadas.' },
    ],
    shotTitle: 'MARCADOR · ZONAS VERDES', shotText: 'A nota oficial de remate Soccerverse determina o número de zonas válidas.',
    keeperTitle: 'GUARDA-REDES · COBERTURA', keeperText: 'A segunda zona deve tocar a primeira e depende das duas notas.',
    low: '1 zona', middle: '2 zonas vizinhas por um lado se o marcador tiver zonas verdes suficientes', elite: '2 zonas que se tocam por lado ou canto se o marcador tiver 5+ zonas verdes',
    finalNote: 'As 20 cartas vêm de notas e posições FC/GK oficiais de Soccerverse. IDs arbitrários são rejeitados. Não é necessário possuir jogadores. Padrões e limiares são regras Arcade.',
  },
};

const shotBands = [['55–59', '3/9'], ['60–64', '4/9'], ['65–69', '5/9'], ['70–79', '6/9'], ['80–89', '7/9'], ['90+', '8/9']];

export default function PulseRules({ onClose }: { onClose: () => void }) {
  const { locale } = useLanguage();
  const copy = rulesCopy[locale];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="pulse-rules-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="pulse-rules-panel" role="dialog" aria-modal="true" aria-labelledby="pulse-rules-title"
      onKeyDown={event => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); } }}>
      <header><div><span>PENALTY PULSE / 01—09</span><h2 id="pulse-rules-title">{copy.title}</h2></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={copy.close}>×</button></header>
      <p className="pulse-rules-intro">{copy.intro}</p>
      <div className="pulse-rules-steps">{copy.steps.map(step => <article key={step.number}>
        <span>{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div>
      </article>)}</div>
      <div className="pulse-rules-tables">
        <section><h3>{copy.shotTitle}</h3><p>{copy.shotText}</p><dl>{shotBands.map(([band, zones]) => <div key={band}><dt>{band}</dt><dd>{zones}</dd></div>)}</dl></section>
        <section><h3>{copy.keeperTitle}</h3><p>{copy.keeperText}</p><dl>
          <div><dt>55–59</dt><dd>{copy.low}</dd></div><div><dt>60–69</dt><dd>{copy.middle} · 8/9</dd></div><div><dt>70–79</dt><dd>{copy.middle} · 6+/9</dd></div><div><dt>80–89</dt><dd>{copy.middle} · 5+/9</dd></div><div><dt>90+</dt><dd>{copy.elite}</dd></div>
        </dl></section>
      </div>
      <p className="pulse-rules-note">{copy.finalNote}</p>
    </section>
  </div>;
}
