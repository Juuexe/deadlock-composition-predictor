export type Hero = { id: number; name: string; portrait?: string };
export function parseHeroes(value: unknown): Hero[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Empty hero catalog.');
  const seen = new Set<number>();
  return value.map(hero => {
    if (!hero || typeof hero !== 'object' || !Number.isSafeInteger(hero.id) || hero.id <= 0 || seen.has(hero.id)
      || typeof hero.name !== 'string' || !hero.name.trim() || (hero.portrait !== undefined
        && (typeof hero.portrait !== 'string' || !/^https:\/\/assets-bucket\.deadlock-api\.com\/assets-api-res\/images\/heroes\/[a-z0-9_]+\.(webp|png)$/.test(hero.portrait)))) throw new Error('Invalid hero catalog entry.');
    seen.add(hero.id);
    return { id: hero.id, name: hero.name, ...(hero.portrait ? { portrait: hero.portrait } : {}) };
  });
}
