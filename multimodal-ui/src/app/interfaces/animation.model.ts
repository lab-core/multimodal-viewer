import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { Passenger } from './passenger.model';
import { Polyline } from './polylines.model';
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
