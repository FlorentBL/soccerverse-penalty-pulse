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
    intro: 'A quick two-player penalty duel: three regulation kicks each, then sudden death if tied.',
    steps: [
      { number: '01', title: 'Choose your duo', body: 'Before each pair of kicks, choose one of the three offered FC shooters and one of the three offered GK keepers. Player 1 locks a hidden duo; player 2 chooses; then player 1 reveals. Neither can counter-pick. In the three regulation pairs, use the 90+, 75–89 and 55–74 rating bands once in each role. You decide when to use each band.' },
      { number: '02', title: 'Read the goal', body: 'There are nine numbered zones. Green zones are where this shooter can score. Both players see the exact same green zones before the keeper chooses a position.' },
      { number: '03', title: 'Dive, then shoot', body: 'The defender secretly places the keeper. The shooter then aims at one zone without seeing that choice. A covered shot is saved; an uncovered green zone is a goal; any other shot goes wide.' },
      { number: '04', title: 'Win the shootout', body: 'Players alternate kicks. The match ends early if the trailing player cannot catch up. A tie after three kicks each goes to paired sudden death; players and bands can then be reused.' },
    ],
    shotTitle: 'SHOOTER · RELIABLE ZONES', shotText: 'Official Soccerverse shooting rating sets how many of the nine zones are green.',
    keeperTitle: 'GOALKEEPER · COVERAGE', keeperText: 'Official Soccerverse goalkeeper rating sets how many zones can be covered.',
    low: '1 zone', middle: '2 zones sharing an edge', elite: '2 touching zones, edge or corner',
    finalNote: 'Only the six displayed players can be selected; arbitrary Soccerverse IDs are rejected by the game rules. Shooters are FC and keepers are GK. Against a shooter with only three green zones, every keeper covers one zone. Ratings and positions are pinned from Soccerverse; ownership is not required. Zone layouts and thresholds are Arcade rules.',
  },
  fr: {
    button: 'RÈGLES', title: 'COMMENT JOUER', close: 'Fermer les règles',
    intro: 'Un duel de penalties rapide à deux : trois tirs réglementaires chacun, puis la mort subite en cas d’égalité.',
    steps: [
      { number: '01', title: 'Choisissez votre duo', body: 'Avant chaque paire de tirs, choisissez parmi les trois tireurs FC et les trois gardiens GK imposés. Le joueur 1 verrouille son duo secret, le joueur 2 choisit, puis le joueur 1 révèle. Aucun ne peut adapter son choix après avoir vu l’autre. Sur les trois paires réglementaires, utilisez une fois les niveaux 90+, 75–89 et 55–74 dans chaque rôle. Vous choisissez quand jouer chaque niveau.' },
      { number: '02', title: 'Lisez la cage', body: 'La cage comporte neuf cases numérotées. Les cases vertes sont celles où ce tireur peut marquer. Les deux joueurs voient exactement les mêmes cases avant que le gardien se place.' },
      { number: '03', title: 'Plongez, puis tirez', body: 'Le défenseur place secrètement son gardien. Le tireur vise ensuite une case sans voir ce choix. Un tir couvert est arrêté ; une case verte non couverte donne un but ; ailleurs, le tir sort.' },
      { number: '04', title: 'Gagnez la séance', body: 'Les joueurs tirent à tour de rôle. La partie finit plus tôt si le retard ne peut plus être rattrapé. Après trois tirs chacun, une égalité mène à une mort subite par paires ; les joueurs et niveaux peuvent alors être réutilisés.' },
    ],
    shotTitle: 'TIREUR · CASES FIABLES', shotText: 'La note de tir officielle Soccerverse détermine combien des neuf cases sont vertes.',
    keeperTitle: 'GARDIEN · COUVERTURE', keeperText: 'La note de gardien officielle Soccerverse détermine les cases couvertes.',
    low: '1 case', middle: '2 cases voisines par un côté', elite: '2 cases qui se touchent, côté ou coin',
    finalNote: 'Seuls les six joueurs affichés peuvent être choisis ; les ID Soccerverse libres sont refusés par les règles. Les tireurs sont FC et les gardiens GK. Face à un tireur qui n’a que trois cases vertes, tout gardien couvre une seule case. Notes et postes Soccerverse sont figés ; posséder un joueur n’est pas nécessaire. Les seuils et motifs sont des règles Arcade.',
  },
  it: {
    button: 'REGOLE', title: 'COME SI GIOCA', close: 'Chiudi le regole',
    intro: 'Una rapida sfida ai rigori: tre tiri regolamentari a testa, poi l’oltranza in caso di pareggio.',
    steps: [
      { number: '01', title: 'Scegli la coppia', body: 'Prima di ogni coppia di rigori, scegli solo fra i tre tiratori FC e i tre portieri GK proposti. Il giocatore 1 blocca la coppia segreta, il giocatore 2 sceglie, poi il primo rivela. Nessuno può cambiare scelta dopo aver visto l’altra. Nei tre turni regolamentari usa una volta le fasce 90+, 75–89 e 55–74 per ciascun ruolo. Decidi tu quando usarle.' },
      { number: '02', title: 'Leggi la porta', body: 'La porta ha nove zone numerate. Le zone verdi sono quelle in cui il tiratore può segnare. Entrambi vedono le stesse zone prima che il portiere scelga la posizione.' },
      { number: '03', title: 'Tuffati, poi tira', body: 'Il difensore posiziona il portiere in segreto. Il tiratore mira a una zona senza vedere la scelta. Un tiro coperto è parato; una zona verde scoperta è gol; altrove il tiro va fuori.' },
      { number: '04', title: 'Vinci la sfida', body: 'I giocatori tirano a turno. La partita termina prima se chi perde non può più recuperare. Dopo tre tiri a testa, il pareggio porta all’oltranza a coppie; giocatori e fasce possono essere riutilizzati.' },
    ],
    shotTitle: 'TIRATORE · ZONE AFFIDABILI', shotText: 'Il valore di tiro ufficiale Soccerverse determina quante delle nove zone sono verdi.',
    keeperTitle: 'PORTIERE · COPERTURA', keeperText: 'Il valore da portiere ufficiale Soccerverse determina le zone coperte.',
    low: '1 zona', middle: '2 zone vicine per lato', elite: '2 zone che si toccano, lato o angolo',
    finalNote: 'Si possono scegliere solo i sei giocatori mostrati; le regole rifiutano gli ID Soccerverse liberi. I tiratori sono FC e i portieri GK. Contro un tiratore con tre zone verdi, ogni portiere copre una zona. Valori e ruoli Soccerverse sono fissati; non serve possedere il giocatore. Soglie e schemi sono regole Arcade.',
  },
  es: {
    button: 'REGLAS', title: 'CÓMO JUGAR', close: 'Cerrar reglas',
    intro: 'Un duelo rápido de penaltis: tres tiros reglamentarios por persona y muerte súbita si hay empate.',
    steps: [
      { number: '01', title: 'Elige tu pareja', body: 'Antes de cada pareja de tiros, elige solo entre los tres lanzadores FC y los tres porteros GK propuestos. El jugador 1 bloquea su pareja secreta; el jugador 2 elige; entonces el primero la revela. Ninguno puede cambiar tras ver la elección rival. En las tres parejas reglamentarias usa una vez los niveles 90+, 75–89 y 55–74 en cada rol. Tú decides cuándo usarlos.' },
      { number: '02', title: 'Lee la portería', body: 'La portería tiene nueve zonas numeradas. Las zonas verdes son aquellas donde el lanzador puede marcar. Ambos ven las mismas zonas antes de que el portero elija su posición.' },
      { number: '03', title: 'Salta y dispara', body: 'El defensor coloca al portero en secreto. Después el lanzador apunta a una zona sin ver esa elección. Un tiro cubierto se para; una zona verde libre es gol; en otra zona el tiro se va fuera.' },
      { number: '04', title: 'Gana la tanda', body: 'Los jugadores tiran por turnos. El partido termina antes si quien pierde ya no puede alcanzar al rival. Tras tres tiros cada uno, el empate lleva a muerte súbita por parejas; se pueden reutilizar jugadores y niveles.' },
    ],
    shotTitle: 'LANZADOR · ZONAS FIABLES', shotText: 'La nota oficial de tiro Soccerverse determina cuántas de las nueve zonas son verdes.',
    keeperTitle: 'PORTERO · COBERTURA', keeperText: 'La nota oficial de portero Soccerverse determina las zonas cubiertas.',
    low: '1 zona', middle: '2 zonas vecinas por un lado', elite: '2 zonas que se tocan, lado o esquina',
    finalNote: 'Solo se pueden elegir los seis jugadores mostrados; las reglas rechazan los ID Soccerverse libres. Los lanzadores son FC y los porteros GK. Ante un lanzador con tres zonas verdes, todo portero cubre una zona. Las notas y posiciones Soccerverse están fijadas; no hace falta poseer al jugador. Los umbrales y patrones son reglas Arcade.',
  },
  pt: {
    button: 'REGRAS', title: 'COMO JOGAR', close: 'Fechar regras',
    intro: 'Um duelo rápido de penáltis: três remates regulamentares por jogador, seguidos de morte súbita em caso de empate.',
    steps: [
      { number: '01', title: 'Escolha a dupla', body: 'Antes de cada par de remates, escolha só entre os três marcadores FC e os três guarda-redes GK propostos. O jogador 1 bloqueia a dupla secreta; o jogador 2 escolhe; depois o primeiro revela. Nenhum pode mudar após ver a escolha rival. Nos três pares regulamentares, use uma vez os níveis 90+, 75–89 e 55–74 em cada papel. Decide quando usar cada nível.' },
      { number: '02', title: 'Leia a baliza', body: 'A baliza tem nove zonas numeradas. As zonas verdes são as que permitem marcar. Ambos veem exatamente as mesmas zonas antes de o guarda-redes escolher a posição.' },
      { number: '03', title: 'Mergulhe e remate', body: 'O defensor posiciona o guarda-redes em segredo. Depois o marcador aponta para uma zona sem ver essa escolha. Um remate coberto é defendido; uma zona verde livre dá golo; noutra zona o remate sai.' },
      { number: '04', title: 'Vença a disputa', body: 'Os jogadores rematam à vez. O jogo acaba cedo se quem perde já não puder recuperar. Após três remates cada, um empate leva a morte súbita por pares; jogadores e níveis podem ser reutilizados.' },
    ],
    shotTitle: 'MARCADOR · ZONAS FIÁVEIS', shotText: 'A nota oficial de remate Soccerverse define quantas das nove zonas são verdes.',
    keeperTitle: 'GUARDA-REDES · COBERTURA', keeperText: 'A nota oficial de guarda-redes Soccerverse define as zonas cobertas.',
    low: '1 zona', middle: '2 zonas vizinhas por um lado', elite: '2 zonas que se tocam, lado ou canto',
    finalNote: 'Só podem ser escolhidos os seis jogadores apresentados; as regras rejeitam IDs Soccerverse livres. Os marcadores são FC e os guarda-redes GK. Contra um marcador com três zonas verdes, qualquer guarda-redes cobre uma zona. Notas e posições Soccerverse estão fixadas; não é preciso possuir o jogador. Limiares e padrões são regras Arcade.',
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
          <div><dt>55–74</dt><dd>{copy.low}</dd></div><div><dt>75–89</dt><dd>{copy.middle}</dd></div><div><dt>90+</dt><dd>{copy.elite}</dd></div>
        </dl></section>
      </div>
      <p className="pulse-rules-note">{copy.finalNote}</p>
    </section>
  </div>;
}
