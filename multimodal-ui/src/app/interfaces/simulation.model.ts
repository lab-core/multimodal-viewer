import { Leg } from './leg.model';
import { Passenger, PassengerStatus } from './passenger.model';
import { Position } from './position.model';
import { Stop } from './stop.model';
import { Vehicle, VehicleStatus } from './vehicle.model';

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

export interface AnimatedLeg extends Leg {
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
}

export type RawPolylines = Record<string, [string, number[]]>;

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
   * The ids of the passengers that will be used for the animation.
   * We need a different variable because the animation service will modify it.
   */
  animatedPassengerIds: string[];

  /**
   * Tags of passengers that are waiting at the stop (not the complete passengers).
   */
  passengerTags: string[];

  /**
   * The ids of the passengers that are actually displayed (different to avoid filters affecting the side panel)
   */
  displayedPassengerIds: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Statistic = Record<string, any>;

export interface StatisticUpdate {
  statistic: Statistic;
}

export type SimulationUpdateType = 'updateStatistic';

export const SIMULATION_UPDATE_TYPES: SimulationUpdateType[] = [
  'updateStatistic',
];

export interface SimulationUpdateTypeMap {
  updateStatistic: StatisticUpdate;
}

export interface SimulationUpdate<T extends keyof SimulationUpdateTypeMap> {
  type: SimulationUpdateType;
  timestamp: number;
  updateIndex: number;
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
  startUpdateIndex: number;
  endTimestamp: number | null;
  endUpdateIndex: number | null; // null when the data is the last one and the animated environment is not fully built
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

  currentLineIndex: number | null;

  /**
   * The ids of the passengers that will be used for the animation.
   * We need a different variable because the animation service will modify it.
   */
  animatedPassengerIds: string[];

  /**
   * The tags of the passengers that are on board.
   */
  passengerTags: string[];

  /**
   * The ids of the passengers that are actually displayed (different to avoid filters affecting the side panel)
   */
  displayedPassengerIds: string[];
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
   * The index of the last update before the snapshot
   */
  updateIndex: number;
}

export interface RawSimulationEnvironment
  extends Pick<SimulationEnvironment, 'timestamp' | 'updateIndex'> {
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
  startUpdateIndex: number;
  endUpdateIndex: number;
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
    updateIndex: number;
    index: number;
  } | null;

  /**
   * Since the loaded states are not guaranteed to be continuous,
   * we need to keep track of where the continuous states start and end.
   *
   * This contains the informations of the last valid state in the continuous states.
   *
   * Be aware that the timestamp and update index here may not be the ones of the last state in
   * the continuous states but the ones of the last update of this state.
   */
  lastContinuousState: {
    timestamp: number;
    updateIndex: number;
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
