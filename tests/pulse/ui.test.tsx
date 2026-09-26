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
    pairPlayers: [0, 0], lastReach: 255,
  };
}
function setup() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
    '1100': 'Erling Braut Haaland', '19465': 'David Raya Martin',
  }) })));
}
afterEach(() => { submit.mockClear(); act(() => useChannelStore.setState({ boardState: null })); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Penalty Pulse touch flow', () => {
  it('explains both roles and their order before locking a player', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState(board(1, 1));
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/choose one soccerverse player for both penalties/i)).toBeInTheDocument();
    expect(screen.getByText('ONE PLAYER · TWO ROLES')).toBeInTheDocument();
    const roles = screen.getAllByRole('listitem');
    expect(roles[0]).toHaveTextContent('01GUARD THEIR PENALTY');
    expect(roles[1]).toHaveTextContent('02TAKE YOUR PENALTY');
    expect(screen.getByText('STRONG SHOOTING')).toBeInTheDocument();
    expect(screen.getByText('STRONG GOALKEEPING')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /David Raya Martin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Harry Kane/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /David Raya Martin/i }));
    await waitFor(() => expect(screen.getByText('#19465')).toBeInTheDocument());
    expect(screen.getByText(/keeper focus/i)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Lock player for both roles/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'pick', kick: 0, playerId: 19465 });
  });
  it('lets a strong goalkeeper choose primary and adjacent reach', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState({ ...board(3, 1), pairPlayers: [1100, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText('#19465')).toBeInTheDocument());
    expect(screen.getByText(/chosen player is now in goal/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/second adjacent zone/i)).toBeInTheDocument();
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '4');
    fireEvent.click(screen.getByRole('button', { name: 'HIGH LEFT' }));
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '0');
    expect(screen.getByRole('button', { name: /Commit dive/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'MID CENTRE' }));
    expect(screen.getByRole('button', { name: 'MID CENTRE' })).toHaveClass('pulse-reach');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Commit dive/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'guard', kick: 0, lane: 0, reach: 4 });
  });
  it('lets the shooter aim without seeing the hidden goalkeeper position', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState({ ...board(4, 0), pairPlayers: [1100, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText('#1100')).toBeInTheDocument());
    expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'HIGH RIGHT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Take shot/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shot', kick: 0, lane: 2 });
  });
  it('animates only after the defender reveals the shot', () => {
    useChannelStore.getState().updateFromBoardState({ ...board(5, 1), pairPlayers: [1100, 19465], pendingLane: 4 });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.queryByTestId('pulse-shot-replay')).not.toBeInTheDocument();
    act(() => useChannelStore.getState().updateFromBoardState({
      ...board(3, 0), kick: 1, turnCount: 6, pairPlayers: [1100, 19465],
      lastShot: 4, lastGuard: 0, lastReach: 4, lastResult: 2, lastPlayer: 1100,
      used: [[1100, 0, 0], [19465, 0, 0]],
    }));
    expect(screen.getByTestId('pulse-shot-replay')).toHaveClass('pulse-replay-saved');
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '4');
  });
  it('keeps the completed sudden-death pair on its actual round', () => {
    useChannelStore.getState().updateFromBoardState({
      ...board(6, 255), kick: 8, turnCount: 36, goals: [1, 0], winner: 0,
      used: [[1100, 154, 129718], [278, 874, 1]],
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 278,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('SUDDEN DEATH')).toBeInTheDocument();
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
  });
});
