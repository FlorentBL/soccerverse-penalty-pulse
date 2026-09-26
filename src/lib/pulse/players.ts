import featured from './featured.json';

export const featuredPlayers = featured;
export function isRosterShooter(id: number, seat: number): boolean {
  return featuredPlayers.some(player => player.role === 'striker' && player.seat === seat && player.id === id);
}
export function isRosterKeeper(id: number, seat: number): boolean {
  return featuredPlayers.some(player => player.role === 'keeper' && player.seat === seat && player.id === id);
}
const cache = new Map<number, Record<string, string>>();
export async function findPlayerName(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id < 1 || id > 523571) return null;
  const shard = Math.floor(id / 32768);
  let entries = cache.get(shard);
  if (!entries) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const response = await fetch(base + '/players/' + shard + '.json');
    if (!response.ok) throw new Error('Player catalogue unavailable');
    entries = await response.json() as Record<string, string>;
    cache.set(shard, entries);
  }
  return entries[String(id)] ?? null;
}
