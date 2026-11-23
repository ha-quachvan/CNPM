// Demo policy values not fixed numerically in the design are centralized here.
export const config = Object.freeze({
  holdMinutes: 15,
  waitingMinutes: 60,
  maxExtensions: 2,
  maxExtensionMinutes: 15,
  minBattery: 20,
  pricePerMinute: 1000,
  wrongHubPenalty: 30000,
  sessionHours: 8,
  passwordResetMinutes: 5,
  loginWindowMinutes: 15,
  maxLoginFailures: 5,
  jobIntervalMs: 1000,
  simulationTimeoutMs: 15000,
  maxScenarioMinutes: 120,
  simulationStepMinutes: 5,
  dispatchReserveVehicles: 2,
  maxSimulationCandidates: 12,
  simulationAnalysisMinutes: 10,
  maxSimulationAnalyses: 20,
  maxDispatchVehicles: 3,
});
export const minute = 60_000;
