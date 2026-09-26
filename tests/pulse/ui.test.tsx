import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChannelStore } from '@xayaarcade/sdk';
import { LanguageProvider } from '@/components/LanguageProvider';
import PulseBoard from '@/components/PulseBoard';
import { usePulseInput } from '@/hooks/use-pulse-input';
import type { PulseState } from '@/lib/pulse/codec';

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
afterEach(() => { submit.mockClear(); act(() => useChannelStore.setState({ boardState: null })); vi.useRealTimers(); });
describe('Penalty Pulse one-penalty touch flow', () => {
  it('explains the simple role sequence in the rules guide', () => {
    useChannelStore.getState().updateFromBoardState(board(0, 0));
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: /rules/i }));
    const dialog = screen.getByRole('dialog', { name: 'HOW TO PLAY' });
    expect(dialog).toHaveTextContent('On your turn to shoot, choose one of your three FC shooters');
    expect(dialog).toHaveTextContent('On the next penalty, you swap roles');
    expect(dialog).toHaveTextContent('2 touching zones, edge or corner');
    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('shows only the three shooters when it is your turn to shoot', async () => {
    useChannelStore.getState().updateFromBoardState(board(0, 0));
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText(/your penalty. choose your shooter/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'STRIKER' }).querySelectorAll('.pulse-roster-cards button')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'KEEPER' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Penalty goal' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Harry Kane/i }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Choose shooter/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shooter', kick: 0, playerId: 184 });
  });
  it('then shows only the three goalkeepers to the defending player', async () => {
    useChannelStore.getState().updateFromBoardState({ ...board(1, 1), pairShooters: [184, 0], usedShooters: [[184, 0, 0], [0, 0, 0]] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/your opponent shoots. choose your goalkeeper/i)).toBeInTheDocument();
    expect(screen.getByText(/their shooter/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'KEEPER' }).querySelectorAll('.pulse-roster-cards button')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'STRIKER' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /David Raya Martin/i }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Choose goalkeeper/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'keeper', kick: 0, playerId: 19465 });
  });
  it('shows whose hotseat turn it is and explains each player has separate picks', () => {
    const p2State = { ...board(0, 1), kick: 1, turnCount: 5,
      usedShooters: [[874, 0, 0], [0, 0, 0]] } as PulseState;
    const p2 = render(<LanguageProvider><PulseBoard localPlayerIndex={1} previewState={p2State} /></LanguageProvider>);
    expect(screen.getByText('P2 plays now')).toBeInTheDocument();
    expect(screen.getByText(/A player used by P1 is still available to P2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cristiano Ronaldo/i })).toBeEnabled();
    p2.unmount();
    const p1State = { ...board(0, 0), kick: 2, turnCount: 10,
      usedShooters: [[874, 0, 0], [874, 0, 0]] } as PulseState;
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} previewState={p1State} /></LanguageProvider>);
    expect(screen.getByText('P1 plays now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cristiano Ronaldo/i })).toBeDisabled();
  });
  it('shows the defender the three reliable zones of a limited shooter', () => {
    useChannelStore.getState().updateFromBoardState({ ...board(2, 1), pairShooters: [1917, 0], pairKeepers: [0, 19465] });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.getByText(/shooter can score only in the 3 green zones/i)).toBeInTheDocument();
    expect(screen.getByText('01 · 02 · 06')).toBeInTheDocument();
    for (const zone of [0, 1, 5]) expect(document.querySelector(`[data-zone="${zone}"]`)).toHaveClass('scoring');
  });
  it('allows only a touching second goalkeeper zone', async () => {
    useChannelStore.getState().updateFromBoardState({ ...board(2, 1), pairShooters: [184, 0], pairKeepers: [0, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'HIGH LEFT' }));
    expect(screen.getByRole('button', { name: 'LOW RIGHT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'LOW RIGHT' })).toHaveClass('unreachable');
    fireEvent.click(screen.getByRole('button', { name: 'MID CENTRE' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Commit dive/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'guard', kick: 0, lane: 0, reach: 4 });
  });
  it('lets the shooter aim without seeing the hidden goalkeeper', async () => {
    useChannelStore.getState().updateFromBoardState({ ...board(3, 0), pairShooters: [184, 0], pairKeepers: [0, 19465] });
    render(<LanguageProvider><InputHarness /><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText(/Harry Kane/i)).toBeInTheDocument();
    expect(screen.queryByTestId('pulse-keeper')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HIGH LEFT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'HIGH LEFT' })).toHaveClass('unavailable-shot');
    expect(screen.getByRole('button', { name: /Take shot/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'HIGH RIGHT' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Take shot/i })));
    expect(submit).toHaveBeenCalledWith({ type: 'shot', kick: 0, lane: 2 });
  });
  it('keeps the goal and result visible until Continue after the shot', () => {
    useChannelStore.getState().updateFromBoardState({ ...board(4, 1), pairShooters: [184, 0], pairKeepers: [0, 19465], pendingLane: 4 });
    render(<LanguageProvider><PulseBoard localPlayerIndex={1} /></LanguageProvider>);
    expect(screen.queryByTestId('pulse-shot-replay')).not.toBeInTheDocument();
    vi.useFakeTimers();
    act(() => useChannelStore.getState().updateFromBoardState({
      ...board(0, 1), kick: 1, turnCount: 5, goals: [1, 0],
      lastShot: 4, lastGuard: 0, lastReach: 1, lastResult: 1, lastPlayer: 184, lastKeeper: 19465,
      usedShooters: [[184, 0, 0], [0, 0, 0]], usedKeepers: [[0, 0, 0], [19465, 0, 0]],
    }));
    expect(screen.getByTestId('pulse-shot-replay')).toHaveClass('pulse-replay-goal');
    act(() => vi.advanceTimersByTime(1900));
    expect(screen.getByRole('status')).toHaveTextContent('GOAL');
    expect(screen.getByRole('status')).toHaveTextContent('Harry Kane');
    expect(document.querySelector('.pulse-last')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Penalty goal' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.pulse-score-side strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows the completed sudden-death round', () => {
    useChannelStore.getState().updateFromBoardState({
      ...board(6, 255), kick: 8, turnCount: 40, goals: [1, 0], winner: 0,
      lastResult: 2, lastGuard: 4, lastShot: 4, lastPlayer: 874, lastKeeper: 62,
    });
    render(<LanguageProvider><PulseBoard localPlayerIndex={0} /></LanguageProvider>);
    expect(screen.getByText('SUDDEN DEATH')).toBeInTheDocument();
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
  });
});
