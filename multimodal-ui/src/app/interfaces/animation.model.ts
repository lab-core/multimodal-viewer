import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { Passenger } from './passenger.model';
import { Polyline } from './polylines.model';
import { SimulationState } from './state.model';
import { Stop } from './stop.model';
import { Vehicle } from './vehicle.model';

export interface Animated<Entity, AdditionalInformation> {
  entity: Entity;
  additionalInformation: AdditionalInformation;
  sprites: Sprite[];
  texts: BitmapText[];
  graphics: Graphics[];
  container: Container;
  backgroundContainer: Container;
  isPresent: boolean; // If true, the entity is present in the current state
  isFiltered: boolean; // If true, the entity is filtered out and not displayed
  isPreselected: boolean; // If true, the entity is preselected
  isSelected: boolean; // If true, the entity is selected
  isVisible: boolean; // If true, the entity is visible in the current view
}

export interface PassengerAdditionalInformation {
  stop: AnimatedStop | null;
  vehicle: AnimatedVehicle | null;
}

export type AnimatedPassenger = Animated<
  Passenger,
  PassengerAdditionalInformation
>;

export interface VehicleAdditionalInformation {
  /**
   * The ids of the visible passengers at the stop.
   */
  passengerIds: string[];
  numberOfPassengers: number;
  numberOfNotVisiblePassengers: number;
  stop: AnimatedStop | null;
  polylines: Polyline[];
  /**
   * The index of the polyline in the polylines array.
   * This is equivalent to the length of the previous stops of the vehicle minus one.
   */
  polylineIndex: number | null;

  polylineSegmentIndex: number | null;
  polylineSegmentProgress: number | null;
}

export type AnimatedVehicle = Animated<Vehicle, VehicleAdditionalInformation>;

export interface StopAdditionalInformation {
  /**
   * The ids of the visible passengers at the stop.
   */
  passengerIds: string[];
  numberOfPassengers: number;
  numberOfCompletePassengers: number;
  numberOfNotVisiblePassengers: number;
  numberOfNotVisibleCompletePassengers: number;
}

export type AnimatedStop = Animated<Stop, StopAdditionalInformation>;

export type AnimatedEntity = AnimatedPassenger | AnimatedVehicle | AnimatedStop;

export function isAnimatedPassenger(
  entity: AnimatedEntity,
): entity is AnimatedPassenger {
  return entity.entity.entityType === 'passenger';
}

export function isAnimatedVehicle(
  entity: AnimatedEntity,
): entity is AnimatedVehicle {
  return entity.entity.entityType === 'vehicle';
}

export function isAnimatedStop(entity: AnimatedEntity): entity is AnimatedStop {
  return entity.entity.entityType === 'stop';
}

export interface AnimatedSimulationStates {
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
}
