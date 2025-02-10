export type SimulationStatus = 'paused' | 'running' | 'completed' | 'stopped';

export const SIMULATION_STATUSES: SimulationStatus[] = [
  'paused',
  'running',
  'completed',
  'stopped',
];

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
  // simulationStartTime: number;

  /**
   * The time in the simulation at which the simulation ends
   */
  // expectedSimulationEndTime: number;

  /**
   * Current configuration of the simulation
   *
   * TODO Maybe change to an array of configurations to keep track of the changes in the configuration.
   */
  // configuration: SimulationConfiguration;
}

export interface SimulationConfiguration {
  /**
   * The time at which the simulation will be automatically stopped
   */
  maxTime: number | null;

  /**
   * TODO I don't know what this is
   * TODO Maybe remove the speed and always run at full speed
   */
  speed: number | null;

  /**
   * The maximum time between two events in the simulation
   */
  timeStep: number | null;

  /**
   * TODO I don't know what this is
   */
  positionTimeStep: number | null;
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
  name: string;
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

export interface Vehicle {
  id: string;
  mode: string;
  status: VehicleStatus;
  latitude: number | null;
  longitude: number | null;
}

export interface VehicleStatusUpdate {
  id: string;
  status: VehicleStatus;
}

export interface VehiclePositionUpdate {
  id: string;
  latitude: number;
  longitude: number;
}

export type SimulationUpdateType =
  | 'createPassenger'
  | 'updatePassengerStatus'
  | 'createVehicle'
  | 'updateVehicleStatus'
  | 'updateVehiclePosition';

export const SIMULATION_UPDATE_TYPES: SimulationUpdateType[] = [
  'createPassenger',
  'updatePassengerStatus',
  'createVehicle',
  'updateVehicleStatus',
  'updateVehiclePosition',
];

export interface SimulationUpdateTypeMap {
  createPassenger: Passenger;
  updatePassengerStatus: PassengerStatusUpdate;
  createVehicle: Vehicle;
  updateVehicleStatus: VehicleStatusUpdate;
  updateVehiclePosition: VehiclePositionUpdate;
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

// TODO temporary
export interface SimulationEnvironment {
  passengers: Record<string, Passenger>;
  vehicles: Record<string, Vehicle>;
}
