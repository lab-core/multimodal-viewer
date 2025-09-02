import { SIMULATION_SAVE_FILE_SEPARATOR } from '../../environments/environment';

export type SimulationStatus =
  | 'starting'
  | 'paused'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'lost'
  | 'corrupted'
  | 'outdated'
  | 'future';

export const SIMULATION_STATUSES: SimulationStatus[] = [
  'starting',
  'paused',
  'running',
  'stopping',
  'completed',
  'lost',
  'corrupted',
  'outdated',
  'future',
];

export function isSimulationStatus(value: unknown): value is SimulationStatus {
  return SIMULATION_STATUSES.includes(value as SimulationStatus);
}

export const RUNNING_SIMULATION_STATUSES: SimulationStatus[] = [
  'starting',
  'running',
  'paused',
  'stopping',
  'lost',
];

export const SIMULATION_STATUSES_ORDER: Record<SimulationStatus, number> = {
  starting: 0,
  running: 1,
  paused: 1,
  stopping: 2,
  lost: 3,
  completed: 4,
  corrupted: 5,
  outdated: 5,
  future: 5,
};

export interface Simulation {
  /**
   * The unique identifier of the simulation
   */
  id: string;

  /**
   * The name given to the simulation
   */
  name: string;

  /**
   * The name of the data source that the simulation is using
   */
  data: string;

  /**
   * The current status of the simulation
   */
  status: SimulationStatus;

  /**
   * The real time at which the simulation was started
   */
  startTime: Date;

  /**
   * The time in the simulation at which the simulation starts
   */
  simulationStartTime: number | null;

  /**
   * The time in the simulation at which the simulation ends
   */
  simulationEndTime: number | null;

  /**
   * The current time in the simulation
   */
  simulationTime: number | null;

  /**
   * The estimated time at which the simulation will end
   */
  simulationEstimatedEndTime: number | null;

  /**
   * The index of the last update
   */
  lastUpdateIndex: number | null;

  /**
   * The current completion of the simulation
   */
  completion: number;

  /**
   * Current configuration of the simulation
   */
  configuration: SimulationConfiguration;

  /**
   * Version of the polylines
   */
  polylinesVersion: number;

  /**
   * The size of the simulation in bytes
   */
  size: number | null;
}

export interface SimulationConfiguration {
  /**
   * The duration of the simulation in in-simulation time.
   */
  maxDuration: number | null;
}

function extractStartTime(startTime: unknown): Date | null {
  if (typeof startTime !== 'string') {
    console.error('Invalid data type for start time', startTime);
    return null;
  }

  if (!/^\d{8}-\d{9}$/.test(startTime)) {
    console.error('Invalid format for start time', startTime);
    return null;
  }

  const year: number = parseInt(startTime.slice(0, 4));
  const month: number = parseInt(startTime.slice(4, 6)) - 1;
  const day: number = parseInt(startTime.slice(6, 8));
  const hours: number = parseInt(startTime.slice(9, 11));
  const minutes: number = parseInt(startTime.slice(11, 13));
  const seconds: number = parseInt(startTime.slice(13, 15));
  const milliseconds: number = parseInt(startTime.slice(16, 19));

  return new Date(year, month, day, hours, minutes, seconds, milliseconds);
}

export function extractSimulation(data: unknown): Simulation | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for simulation', data);
    return null;
  }

  if (!('id' in data) || typeof data.id !== 'string') {
    console.error('Invalid simulation ID in simulation', data);
    return null;
  }
  const id = data.id;

  if (!('status' in data) || !isSimulationStatus(data.status)) {
    console.error('Invalid simulation status in simulation', data);
    return null;
  }
  const status = data.status;

  if (data.status === 'corrupted') {
    const name = data.id.split(SIMULATION_SAVE_FILE_SEPARATOR)[1] ?? 'unknown';
    const startTime =
      extractStartTime(data.id.split(SIMULATION_SAVE_FILE_SEPARATOR)[0]) ??
      new Date(0);

    return {
      id,
      name,
      data: 'unknown',
      status,
      startTime,
      simulationStartTime: null,
      simulationEndTime: null,
      simulationTime: null,
      simulationEstimatedEndTime: null,
      lastUpdateIndex: null,
      completion: -1,
      configuration: {
        maxDuration: null,
      },
      polylinesVersion: -1,
      size: null,
    };
  }

  if (!('name' in data) || typeof data.name !== 'string') {
    console.error('Invalid simulation name in simulation', data);
    return null;
  }
  const name = data.name;

  if (!('data' in data) || typeof data.data !== 'string') {
    console.error('Invalid simulation data in simulation', data);
    return null;
  }
  const inputData = data.data;

  if (!('startTime' in data)) {
    console.error('Invalid simulation start time in simulation', data);
    return null;
  }
  const startTime = extractStartTime(data.startTime);
  if (startTime === null) {
    console.error(
      'Invalid simulation start time',
      data.startTime,
      'in simulation',
      data,
    );
    return null;
  }

  let simulationStartTime: Simulation['simulationStartTime'] = null;
  if ('simulationStartTime' in data) {
    if (typeof data.simulationStartTime !== 'number') {
      console.error(
        'Invalid simulation start time',
        data.simulationStartTime,
        'in simulation',
        data,
      );
      return null;
    }

    simulationStartTime = data.simulationStartTime;
  }

  let simulationEndTime: Simulation['simulationEndTime'] = null;
  if ('simulationEndTime' in data) {
    if (typeof data.simulationEndTime !== 'number') {
      console.error(
        'Invalid simulation end time',
        data.simulationEndTime,
        'in simulation',
        data,
      );
      return null;
    }

    simulationEndTime = data.simulationEndTime;
  }

  let simulationTime: Simulation['simulationTime'] = null;
  if ('simulationTime' in data) {
    if (typeof data.simulationTime !== 'number') {
      console.error(
        'Invalid simulation time',
        data.simulationTime,
        'in simulation',
        data,
      );
      return null;
    }

    simulationTime = data.simulationTime;
  }

  let simulationEstimatedEndTime: Simulation['simulationEstimatedEndTime'] =
    null;
  if ('simulationEstimatedEndTime' in data) {
    if (typeof data.simulationEstimatedEndTime !== 'number') {
      console.error(
        'Invalid simulation estimated end time',
        data.simulationEstimatedEndTime,
        'in simulation',
        data,
      );
      return null;
    }

    simulationEstimatedEndTime = data.simulationEstimatedEndTime;
  }

  let lastUpdateIndex: Simulation['lastUpdateIndex'] = null;
  if ('lastUpdateIndex' in data) {
    if (typeof data.lastUpdateIndex !== 'number') {
      console.error(
        'Invalid last update index',
        data.lastUpdateIndex,
        'in simulation',
        data,
      );
      return null;
    }

    lastUpdateIndex = data.lastUpdateIndex;
  }

  let completion = 1;
  if (RUNNING_SIMULATION_STATUSES.includes(status)) {
    if (
      simulationStartTime !== null &&
      simulationTime !== null &&
      simulationEstimatedEndTime !== null
    ) {
      completion =
        (simulationTime - simulationStartTime) /
        (simulationEstimatedEndTime - simulationStartTime);
    } else {
      console.warn(
        'Incomplete simulation data for completion calculation',
        data,
      );
      completion = 0;
    }
  }

  let maxDuration: Simulation['configuration']['maxDuration'] = null;
  if ('configuration' in data) {
    if (typeof data.configuration !== 'object' || data.configuration === null) {
      console.error(
        'Invalid configuration',
        data.configuration,
        'in simulation',
        data,
      );
      return null;
    }

    if ('maxDuration' in data.configuration) {
      if (
        data.configuration.maxDuration !== null &&
        typeof data.configuration.maxDuration !== 'number'
      ) {
        console.error(
          'Invalid max duration',
          data.configuration.maxDuration,
          'in simulation',
          data,
        );
        return null;
      }

      maxDuration = data.configuration.maxDuration;
    }
  }

  let polylinesVersion: Simulation['polylinesVersion'] = -1;
  if ('polylinesVersion' in data) {
    if (typeof data.polylinesVersion !== 'number') {
      console.error(
        'Invalid polylines version',
        data.polylinesVersion,
        'in simulation',
        data,
      );
      return null;
    }

    polylinesVersion = data.polylinesVersion;
  }

  let size: Simulation['size'] = null;
  if ('size' in data) {
    if (data.size !== null && typeof data.size !== 'number') {
      console.error('Invalid size', data.size, 'in simulation', data);
      return null;
    }

    size = data.size;
  }

  return {
    id,
    name,
    data: inputData,
    status,
    startTime,
    simulationStartTime,
    simulationEndTime,
    simulationTime,
    simulationEstimatedEndTime,
    lastUpdateIndex,
    completion,
    configuration: {
      maxDuration,
    },
    polylinesVersion,
    size,
  };
}

export function sortSimulations(a: Simulation, b: Simulation): number {
  // First compare the orders
  const aOrder = SIMULATION_STATUSES_ORDER[a.status];
  const bOrder = SIMULATION_STATUSES_ORDER[b.status];

  if (aOrder < bOrder) {
    return -1;
  }
  if (aOrder > bOrder) {
    return 1;
  }

  // If the orders are the same, compare the start times
  if (a.startTime < b.startTime) {
    return 1;
  }
  return -1;
}
