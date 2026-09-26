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
    expect(screen.getByText(/striker cannot see it before shooting/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Erling Braut Haaland')).toBeInTheDocument());
    expect(screen.getByText('96/100')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '4');
    fireEvent.click(screen.getByRole('button', { name: 'HIGH LEFT' }));
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '0');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Commit dive/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'guard', kick: 0, lane: 0 });
    act(() => useChannelStore.getState().updateFromBoardState(board(2, 0)));
    expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take shot/i })).not.toBeInTheDocument();
  });
  it('announces a Soccerverse player before the defender chooses a lane', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState(board(0, 0));
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Erling Braut Haaland/ }));
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Confirm player/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'pick', kick: 0, playerId: 1100 });
  });
  it('aims the shot after the keeper commitment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState({ ...board(2, 0), pendingPlayer: 1100 });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
    expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'HIGH RIGHT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Take shot/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shot', kick: 0, lane: 2 });
  });
  it('shows the keeper after the result, then clears the old dive for the next striker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState({
      ...board(0, 1), kick: 1, turnCount: 4, lastResult: 2,
      lastGuard: 8, lastShot: 8, lastPlayer: 1100,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '8');
    expect(screen.getByTestId('pulse-keeper').querySelector('.pulse-keeper-catch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Erling Braut Haaland/ }));
    await waitFor(() => expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument());
  });
  it('shows sudden death and lets a striker reuse a regulation player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ '1100': 'Erling Braut Haaland' }) })));
    useChannelStore.getState().updateFromBoardState({
      ...board(0, 0), kick: 6, turnCount: 24,
      used: [[1100, 154, 129718], [278, 874, 1]],
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 1,
    });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('SUDDEN DEATH')).toBeInTheDocument();
    const haaland = screen.getByRole('button', { name: /Erling Braut Haaland/ });
    expect(haaland).toBeEnabled();
    fireEvent.click(haaland);
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
  });
  it('keeps the completed sudden-death pair on its actual round', () => {
    useChannelStore.getState().updateFromBoardState({
      ...board(4, 255), kick: 8, turnCount: 32, goals: [1, 0], winner: 0,
      used: [[1100, 154, 129718], [278, 874, 1]],
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 278,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('SUDDEN DEATH')).toBeInTheDocument();
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
  });
  it('keeps an early finish on the deciding regulation kick', () => {
    useChannelStore.getState().updateFromBoardState({
      ...board(4, 255), kick: 4, turnCount: 16, goals: [2, 0], winner: 0,
      used: [[1100, 154, 0], [278, 874, 0]],
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 874,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('KICK 4')).toBeInTheDocument();
  });
});
