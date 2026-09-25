import type { GameAdapter } from '@xayaarcade/sdk';
import { ensureGameJudge, getLoadedJudge, useChannelStore } from '@xayaarcade/sdk';
import { MOVE_NS } from '@/app-identity';
import { PulseBoardRules } from '@/lib/pulse/board-rules';
import { PulseChannel } from '@/lib/pulse/channel';
import PulseBoard from '@/components/PulseBoard';
import { usePulseInput } from '@/hooks/use-pulse-input';

export const pulseAdapter: GameAdapter = {
  gameId: MOVE_NS,
  timing: 'turnbased',
  async ensureLoaded() { await ensureGameJudge(MOVE_NS); },
  makeBoardRules: () => new PulseBoardRules(getLoadedJudge(MOVE_NS)),
  makeOpenChannel: () => new PulseChannel(useChannelStore.getState().channelId),
  Renderer: PulseBoard,
  useInput: usePulseInput,
  controlsHint: 'Choose your keeper lane. Shoot with a Soccerverse player.',
  stallGraceMs: 120_000,
  presentation: { aspectRatio: 1.05, minViewport: { width: 320, height: 400 }, immersive: 'preferred', fullFrameOnTouch: true },
};
