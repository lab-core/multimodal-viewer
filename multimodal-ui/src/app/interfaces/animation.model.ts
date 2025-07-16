import { SimulationEnvironment } from './environment.model';
import { Leg } from './leg.model';
import { Passenger, PassengerStatus } from './passenger.model';
import { Polyline } from './polylines.model';
import { Position } from './position.model';
import { SimulationState } from './state.model';
import { Stop } from './stop.model';
import { Vehicle, VehicleStatus } from './vehicle.model';

export interface AnimatedLeg extends Leg {
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
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
