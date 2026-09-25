import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChannelStore } from '@xayaarcade/sdk';
import { LanguageProvider } from '@/components/LanguageProvider';
import PulseBoard from '@/components/PulseBoard';
import { usePulseInput } from '@/hooks/use-pulse-input';

const submit = vi.fn(async (_input: unknown) => true);
function InputHarness() { usePulseInput(submit); return null; }
function board(phase: number, turn: number) {
  return {
    participants: 2, phase, turn, kick: 0, goals: [0, 0], winner: -1,
    turnCount: phase, pendingPlayer: 0, pendingLane: 255, lastResult: 0,
    used: [[0, 0, 0], [0, 0, 0]], lastPlayer: 0, lastShot: 255, lastGuard: 255,
  };
}
afterEach(() => { submit.mockClear(); act(() => useChannelStore.setState({ boardState: null })); vi.unstubAllGlobals(); });
describe('Penalty Pulse touch flow', () => {
  it('lets the defender choose a hidden dive and the striker choose a real player and shot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState({ ...board(1, 1), pendingPlayer: 1100 });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/choice stays hidden/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Erling Braut Haaland')).toBeInTheDocument());
    expect(screen.getByText(/RIGHT \+ LEFT/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'LEFT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Commit dive/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'guard', kick: 0, lane: 0 });
    act(() => useChannelStore.getState().updateFromBoardState(board(2, 0)));
    expect(screen.queryByRole('button', { name: /Take shot/i })).not.toBeInTheDocument();
  });
  it('announces a Soccerverse player before the defender chooses a lane', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState(board(0, 0));
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Erling Braut Haaland' }));
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Confirm player/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'pick', kick: 0, playerId: 1100 });
  });
  it('aims the shot after the keeper commitment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState({ ...board(2, 0), pendingPlayer: 1100 });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'RIGHT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Take shot/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shot', kick: 0, lane: 2 });
  });
});
