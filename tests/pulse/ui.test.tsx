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
    turnCount: phase, pendingShooter: 0, pendingKeeper: 0, pendingLane: 255, lastResult: 0,
    usedShooters: [[0, 0, 0], [0, 0, 0]], usedKeepers: [[0, 0, 0], [0, 0, 0]],
    lastPlayer: 0, lastKeeper: 0, lastShot: 255, lastGuard: 255,
    pairShooters: [0, 0], pairKeepers: [0, 0], lastReach: 255,
  };
}
function setup() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
    '184': 'Harry Kane', '19465': 'David Raya Martin', '159': 'Hugo Lloris', '21': 'Low scorer',
  }) })));
}
afterEach(() => { submit.mockClear(); act(() => useChannelStore.setState({ boardState: null })); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Penalty Pulse touch flow', () => {
  it('offers three rating bands in each role and locks a distinct duo', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState(board(1, 1));
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/choose one shooter and one keeper/i)).toBeInTheDocument();
    expect(screen.getByText('TWO PLAYERS · TWO ROLES')).toBeInTheDocument();
    const roles = screen.getAllByRole('listitem');
    expect(roles[0]).toHaveTextContent('01GUARD THEIR PENALTY');
    expect(roles[1]).toHaveTextContent('02TAKE YOUR PENALTY');
    expect(screen.getAllByText('90+')).toHaveLength(2);
    expect(screen.getAllByText('75–89')).toHaveLength(2);
    expect(screen.getAllByText('55–74')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Harry Kane/i }));
    fireEvent.click(screen.getByRole('button', { name: /David Raya Martin/i }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Lock lineup/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'pick', kick: 0, shooterId: 184, keeperId: 19465 });
  });
  it('shows the goalkeeper every scoring zone of a limited shooter before the dive', () => {
    setup();
    useChannelStore.getState().updateFromBoardState({ ...board(3, 1), pairShooters: [21, 1100], pairKeepers: [62, 19465] });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/shooter can score only in the 3 green zones/i)).toBeInTheDocument();
    expect(screen.getByText('03 · 04 · 08')).toBeInTheDocument();
    for (const zone of [3, 7, 2])
      expect(document.querySelector(`[data-zone="${zone}"]`)).toHaveClass('scoring');
    expect(document.querySelector('[data-zone="0"]')).not.toHaveClass('scoring');
  });
  it('lets an elite goalkeeper cover any second zone while keeping the dive hidden', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState({ ...board(3, 1), pairShooters: [184, 1100], pairKeepers: [62, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/elite keeper: choose any second zone/i)).toBeInTheDocument();
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '4');
    fireEvent.click(screen.getByRole('button', { name: 'HIGH LEFT' }));
    expect(screen.getByRole('button', { name: /Commit dive/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'LOW RIGHT' }));
    expect(screen.getByRole('button', { name: 'LOW RIGHT' })).toHaveClass('pulse-reach');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Commit dive/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'guard', kick: 0, lane: 0, reach: 8 });
  });
  it('lets the shooter aim without seeing the hidden goalkeeper position', async () => {
    setup();
    useChannelStore.getState().updateFromBoardState({ ...board(4, 0), pairShooters: [184, 1100], pairKeepers: [62, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText(/Harry Kane/i)).toBeInTheDocument());
    expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'HIGH RIGHT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Take shot/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shot', kick: 0, lane: 2 });
  });
  it('animates only after the defender reveals the shot', () => {
    useChannelStore.getState().updateFromBoardState({ ...board(5, 1), pairShooters: [184, 1100], pairKeepers: [62, 19465], pendingLane: 4 });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.queryByTestId('pulse-shot-replay')).not.toBeInTheDocument();
    act(() => useChannelStore.getState().updateFromBoardState({
      ...board(3, 0), kick: 1, turnCount: 6, pairShooters: [184, 1100], pairKeepers: [62, 19465],
      lastShot: 4, lastGuard: 0, lastReach: 4, lastResult: 2, lastPlayer: 184, lastKeeper: 19465,
      usedShooters: [[184, 0, 0], [1100, 0, 0]], usedKeepers: [[62, 0, 0], [19465, 0, 0]],
    }));
    expect(screen.getByTestId('pulse-shot-replay')).toHaveClass('pulse-replay-saved');
    expect(screen.getByTestId('pulse-keeper')).toHaveAttribute('data-lane', '4');
  });
  it('keeps the completed sudden-death pair on its actual round', () => {
    useChannelStore.getState().updateFromBoardState({
      ...board(6, 255), kick: 8, turnCount: 36, goals: [1, 0], winner: 0,
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 1100, lastKeeper: 62,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('SUDDEN DEATH')).toBeInTheDocument();
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
  });
});
