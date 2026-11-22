// Illustrative campus travel profiles, not measured demand or road-routing data.
export const demandRoutes = [
  { from: 'hub-b', to: 'hub-a', every: 3, travel: 10 },
  { from: 'hub-metro', to: 'hub-bk', every: 1, travel: 10 },
  { from: 'hub-a', to: 'hub-metro', every: 2, travel: 10 },
  { from: 'hub-bk', to: 'hub-metro', every: 3, travel: 10 },
  { from: 'hub-b', to: 'hub-metro', every: 3, travel: 15 },
  { from: 'hub-bk', to: 'hub-library', every: 2, travel: 5 },
  { from: 'hub-library', to: 'hub-b', every: 2, travel: 10 },
];
export function travelMinutes(from: string, to: string): number {
  return (
    demandRoutes.find((r) => (r.from === from && r.to === to) || (r.to === from && r.from === to))
      ?.travel ?? 10
  );
}
