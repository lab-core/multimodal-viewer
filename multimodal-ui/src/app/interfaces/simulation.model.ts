export const SIMULATION_SAVE_FILE_SEPARATOR = '---';

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

export const RUNNING_SIMULATION_STATUSES: SimulationStatus[] = [
  'starting',
  'running',
  'paused',
  'stopping',
  'lost',
];

export const STATUSES_ORDER: Record<SimulationStatus, number> = {
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
   * An indicator of the progress of the simulation
   */
  // completion: number;

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
   * The order of the last update
   */
  lastUpdateOrder: number | null;

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
}

export interface SimulationConfiguration {
  /**
   * The time at which the simulation will be automatically stopped
   */
  maxTime: number | null;
}

export type PassengerStatus =
  | 'release'
  | 'assigned'
  | 'ready'
  | 'onboard'
  | 'complete';

export const PASSENGER_STATUSES: PassengerStatus[] = [
  'release',
  'assigned',
  'ready',
  'onboard',
  'complete',
];

export interface Passenger {
  id: string;
  name: string | null;
  status: PassengerStatus;
}
export interface PassengerStatusUpdate {
  id: string;
  status: PassengerStatus;
}

export type VehicleStatus =
  | 'release'
  | 'idle'
  | 'boarding'
  | 'enroute'
  | 'alighting'
  | 'complete';

export const VEHICLE_STATUSES: VehicleStatus[] = [
  'release',
  'idle',
  'boarding',
  'enroute',
  'alighting',
  'complete',
];

export type RawPolylines = Record<string, [string, number[]]>;

export interface Polyline {
  polyline: { latitude: number; longitude: number }[];
  coefficients: number[];
}

export type Polylines = Record<string, Polyline>;

export interface AllPolylines {
  version: number;
  polylinesByVehicleId: Record<string, Polylines>;
}

export interface Stop {
  arrivalTime: number;
  departureTime: number | null; // null means infinite
}

export interface Vehicle {
  id: string;
  mode: string | null;
  status: VehicleStatus;
  latitude: number | null;
  longitude: number | null;
  polylines: Polylines | null;
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
}

export interface VehicleStatusUpdate {
  id: string;
  status: VehicleStatus;
}

export interface VehicleStopsUpdate {
  id: string;
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
}

export type Statistic = Record<
  string,
  Record<string, Record<string, number>>
  >;

export interface StatisticUpdate {
    statistic: Statistic
  }

export type SimulationUpdateType =
  | 'createPassenger'
  | 'updatePassengerStatus'
  | 'createVehicle'
  | 'updateVehicleStatus'
  | 'updateVehicleStops'
  | 'updateStatistic';

export const SIMULATION_UPDATE_TYPES: SimulationUpdateType[] = [
  'createPassenger',
  'updatePassengerStatus',
  'createVehicle',
  'updateVehicleStatus',
  'updateVehicleStops',
  'updateStatistic',
];

export interface SimulationUpdateTypeMap {
  createPassenger: Passenger;
  updatePassengerStatus: PassengerStatusUpdate;
  createVehicle: Vehicle;
  updateVehicleStatus: VehicleStatusUpdate;
  updateVehicleStops: VehicleStopsUpdate;
  updateStatistic: StatisticUpdate;
}

export interface SimulationUpdate<T extends keyof SimulationUpdateTypeMap> {
  type: SimulationUpdateType;
  timestamp: number;
  order: number;
  data: SimulationUpdateTypeMap[T];
}

export type AnySimulationUpdate = SimulationUpdate<
  keyof SimulationUpdateTypeMap
>;

/**
 * Snapshot of the simulation environment at a given time
 */
export interface SimulationEnvironment {
  passengers: Record<string, Passenger>;
  vehicles: Record<string, Vehicle>;
  statistic: Record<string, Record<string, Record<string, number>>>;

  /**
   * The timestamp of the last update before the snapshot
   */
  timestamp: number;

  /**
   * The order of the last update before the snapshot
   */
  order: number;
}

export interface RawSimulationEnvironment
  extends Pick<SimulationEnvironment, 'timestamp' | 'order'> {
  passengers: Passenger[];
  vehicles: Vehicle[];
  statistic: Record<string, Record<string, Record<string, number>>>;
}

export interface RawSimulationState extends RawSimulationEnvironment {
  updates: AnySimulationUpdate[];
}

export interface SimulationState extends SimulationEnvironment {
  updates: AnySimulationUpdate[];
}

export interface SimulationStates {
  /**
   * All loaded states
   */
  states: SimulationState[];

  /**
   * If true, the client will continue to request more states
   * even if the necessary state for the visualization is loaded.
   */
  shouldRequestMoreStates: boolean;

  /**
   * Since the loaded states are not guaranteed to be continuous,
   * we need to keep track of where the continuous states start and end.
   *
   * This contains the informations of the first valid state in the continuous states.
   */
  firstContinuousState: {
    timestamp: number;
    order: number;
    index: number;
  } | null;

  /**
   * Since the loaded states are not guaranteed to be continuous,
   * we need to keep track of where the continuous states start and end.
   *
   * This contains the informations of the last valid state in the continuous states.
   *
   * Be aware that the timestamp and order here may not be the ones of the last state in
   * the continuous states but the ones of the last update of this state.
   */
  lastContinuousState: {
    timestamp: number;
    order: number;
    index: number;
  } | null;

  /**
   * Information about the bounds of the current state to know if it changes.
   *
   * When the visualization time is greater than `endTimestamp` or
   * lower than `startTimestamp`, we need to request new states.
   */
  currentState: {
    startTimestamp: number;

    /**
     * This is actually the start of the next state if it exists, otherwise it is the end of the current state.
     */
    endTimestamp: number;
  } | null;
}

export const STATE_SAVE_STEP = 500;
