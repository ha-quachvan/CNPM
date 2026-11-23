// Schematic travel assumptions for the Hub map only; not measured road distances.
const connections = [
  { from: 'hub-b', to: 'hub-a', minutes: 10 },
  { from: 'hub-metro', to: 'hub-bk', minutes: 10 },
  { from: 'hub-a', to: 'hub-metro', minutes: 10 },
  { from: 'hub-b', to: 'hub-metro', minutes: 15 },
  { from: 'hub-bk', to: 'hub-library', minutes: 5 },
  { from: 'hub-library', to: 'hub-b', minutes: 10 },
];
export function travelMinutes(from: string, to: string): number {
  if (from === to) return 0;
  return (
    connections.find((r) => (r.from === from && r.to === to) || (r.to === from && r.from === to))
      ?.minutes ?? 10
  );
}
