import { EntityType } from './entity.model';

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
   * The duration of the simulation in in-simulation time.
   */
  maxDuration: number | null;
}

export interface Tagged {
  tags: string[];
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

export interface Leg extends Tagged {
  assignedVehicleId: string | null;
  boardingStopIndex: number | null;
  alightingStopIndex: number | null;
  boardingTime: number | null;
  alightingTime: number | null;
  assignedTime: number | null;
}

export interface AnimatedLeg extends Leg {
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
}

export interface Passenger extends DataEntity, Tagged {
  id: string;
  name: string | null;
  status: PassengerStatus;
  previousLegs: Leg[];
  currentLeg: Leg | null;
  nextLegs: Leg[];
  numberOfPassengers: number;
}

export interface PassengerStatusUpdate {
  id: string;
  status: PassengerStatus;
}

export interface PassengerLegsUpdate {
  id: string;
  previousLegs: Leg[];
  currentLeg: Leg | null;
  nextLegs: Leg[];
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

export interface Position {
  latitude: number;
  longitude: number;
}

export interface Polyline {
  polyline: Position[];
  coefficients: number[];
}

export interface AllPolylines {
  version: number;
  polylinesByCoordinates: Record<string, Polyline>;
}

export interface DisplayedPolylines {
  /**
   * To show the entire path of the vehicle
   */
  polylines: Polyline[];

  /**
   * Before this index, everything has been traveled.
   *
   * After this index, everything is to be traveled.
   *
   * At this index, the vehicle is currently traveling.
   *
   * If -1, all polylines are gray.
   */
  currentPolylineIndex: number;

  /**
   * If null, the polyline will not be green.
   */
  currentPolylineStartTime: number | null;

  /**
   * If null, the polyline will not be green.
   */
  currentPolylineEndTime: number | null;
}

export interface Stop extends DataEntity, Tagged {
  arrivalTime: number;
  departureTime: number | null; // null means infinite
  position: Position;
  id: string;
  capacity: number;
  label: string;
}

export interface AnimatedStop extends Stop {
  /**
   * Passengers that are waiting at the stop.
   */
  passengerIds: string[];

  /**
   * Vehicles that are waiting at the stop.
   */
  vehicleIds: string[];

  /**
   * The number of passengers that are waiting at the stop.
   *
   * This is different from the length of the passengerIds array because
   * one passenger can account for multiple people and passengerIds contains
   * only the displayed passengers.
   */
  numberOfPassengers: number;

  numberOfCompletePassengers: number;

  /**
   * Tags of passengers that are waiting at the stop (not the complete passengers).
   */
  passengerTags: string[];
}

export const DEFAULT_STOP_CAPACITY = 10;

export interface DataEntity {
  id: string;
  entityType: EntityType;
}

export interface Vehicle extends DataEntity, Tagged {
  id: string;
  mode: string | null;
  status: VehicleStatus;
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
  capacity: number;
  name: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Statistic = Record<string, any>;

export interface StatisticUpdate {
  statistic: Statistic;
}

export type SimulationUpdateType =
  | 'createPassenger'
  | 'updatePassengerStatus'
  | 'updatePassengerLegs'
  | 'createVehicle'
  | 'updateVehicleStatus'
  | 'updateVehicleStops'
  | 'updateStatistic';

export const SIMULATION_UPDATE_TYPES: SimulationUpdateType[] = [
  'createPassenger',
  'updatePassengerStatus',
  'updatePassengerLegs',
  'createVehicle',
  'updateVehicleStatus',
  'updateVehicleStops',
  'updateStatistic',
];

export interface SimulationUpdateTypeMap {
  createPassenger: Passenger;
  updatePassengerStatus: PassengerStatusUpdate;
  updatePassengerLegs: PassengerLegsUpdate;
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

export type displayed<T> = T & {
  /**
   * If the object is not displayed, this field contains the reason why
   * it is not displayed.
   *
   * If the object is displayed, this field is null.
   */
  notDisplayedReason: string | null;
};

export interface EntityAnimationData {
  startTimestamp: number;
  startOrder: number;
  endTimestamp: number | null;
  endOrder: number | null; // null when the data is the last one and the animated environment is not fully built
  notDisplayedReason: string | null; // null when the data is the last one and the animated environment is not fully built
}

export interface PassengerAnimationData extends EntityAnimationData {
  vehicleId: string | null;
  status: PassengerStatus;
}

export interface StaticPassengerAnimationData extends PassengerAnimationData {
  stopIndex: number;
}

export interface DynamicPassengerAnimationData extends PassengerAnimationData {
  isOnBoard: boolean; // always true
}

export type AnyPassengerAnimationData =
  | StaticPassengerAnimationData
  | DynamicPassengerAnimationData
  | PassengerAnimationData; // For not displayed passengers

export interface VehicleAnimationData extends EntityAnimationData {
  status: VehicleStatus;

  displayedPolylines: DisplayedPolylines;
}

export interface StaticVehicleAnimationData extends VehicleAnimationData {
  position: Position;
  stopId: string;
}

export interface DynamicVehicleAnimationData extends VehicleAnimationData {
  polyline: Polyline;
}

export type AnyVehicleAnimationData =
  | StaticVehicleAnimationData
  | DynamicVehicleAnimationData
  | VehicleAnimationData; // For not displayed vehicles

export interface AnimatedPassenger extends displayed<Passenger> {
  animationData: AnyPassengerAnimationData[];
  previousLegs: AnimatedLeg[];
  currentLeg: AnimatedLeg | null;
  nextLegs: AnimatedLeg[];
}

export interface AnimatedVehicle extends displayed<Vehicle> {
  animationData: AnyVehicleAnimationData[];
  passengerIds: string[];
  /**
   * The number of passengers that are on board the vehicle.
   * This is different from the length of the passengerIds array because
   * one passenger can account for multiple people and passengerIds contains
   * only the displayed passengers.
   */
  numberOfPassengers: number;
  currentLineIndex: number | null;
}

/**
 * Snapshot of the simulation environment at a given time
 */
export interface SimulationEnvironment {
  passengers: Record<string, Passenger>;
  vehicles: Record<string, Vehicle>;
  statistic: Statistic;

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
  statistic: Statistic;
}

export interface RawSimulationState extends RawSimulationEnvironment {
  updates: AnySimulationUpdate[];
}

export interface SimulationState extends SimulationEnvironment {
  updates: AnySimulationUpdate[];
}

export interface AnimationData {
  passengers: Record<string, AnyPassengerAnimationData[]>;
  vehicles: Record<string, AnyVehicleAnimationData[]>;
  startTimestamp: number;
  endTimestamp: number;
  startOrder: number;
  endOrder: number;
}

export interface AnimatedSimulationState extends SimulationState {
  /**
   * A data structure to speed up the animation
   */
  animationData: AnimationData;
}

export interface AnimatedSimulationEnvironment extends SimulationEnvironment {
  /**
   * A data structure to speed up the animation
   */
  animationData: AnimationData;
  passengers: Record<string, AnimatedPassenger>;
  vehicles: Record<string, AnimatedVehicle>;
  stops: Record<string, AnimatedStop>;
}

export interface AnimatedSimulationStates {
  /**
   * All loaded states
   */
  states: AnimatedSimulationState[];

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

  continuousAnimationData: AnimationData | null;
}

function addTypeToStop(
  stop: Stop,
  type: 'previous' | 'current' | 'next',
): Stop & { type: 'previous' | 'current' | 'next' } {
  const castedStop = stop as Stop & {
    type: 'previous' | 'current' | 'next';
  };
  castedStop.type = type;
  return castedStop;
}

export function getAllStops(
  vehicle: Vehicle,
): (Stop & { type: 'previous' | 'current' | 'next' })[] {
  return vehicle.previousStops
    .map((stop) => addTypeToStop(stop, 'previous'))
    .concat(
      vehicle.currentStop === null
        ? []
        : [addTypeToStop(vehicle.currentStop, 'current')],
      vehicle.nextStops.map((stop) => addTypeToStop(stop, 'next')),
    );
}

export function getAllLegs<P extends Passenger>(
  passenger: P,
): P['previousLegs'] {
  return passenger.previousLegs.concat(
    passenger.currentLeg === null ? [] : [passenger.currentLeg],
    passenger.nextLegs,
  );
}

export function getStopId(position: Position): string {
  return '' + position.latitude + ',' + position.longitude;
}
