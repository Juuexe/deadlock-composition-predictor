export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Deadlock API returned HTTP ${response.status}; retry later if rate limited.`);
  return response.json();
}
