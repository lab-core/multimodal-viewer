export interface Simulation {
  name: string;
  data: string;
  completion: number;
  status: 'paused' | 'running' | 'completed' | 'starting' | 'stopping';
}

export interface SimulationConfiguration {
  maxTime: number | null;
  speed: number | null;
  timeStep: number | null;
  positionTimeStep: number | null;
}
