import getName from 'node-random-name';
import { EntityMetadata } from './entity.model';
import { extractLeg, Leg } from './leg.model';
import { isTagged } from './tags.model';

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

export function isPassengerStatus(value: unknown): value is PassengerStatus {
  return PASSENGER_STATUSES.includes(value as PassengerStatus);
}

export interface Passenger extends EntityMetadata {
  status: PassengerStatus;
  previousLegs: Leg[];
  currentLeg: Leg | null;
  nextLegs: Leg[];
  numberOfPassengers: number;
}

export function extractPassenger(data: unknown): Passenger | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for passenger', data);
    return null;
  }

  if (!('id' in data) || typeof data.id !== 'string') {
    console.error('Invalid ID for passenger', data);
    return null;
  }
  const id = data.id;

  const name = getName({ seed: id });
  // For now, always generate a name, but we could also check if the name is already set.
  // if ('name' in data) {
  //   if (typeof data.name !== 'string') {
  //     console.error('Invalid name', data.name, 'in passenger', data);
  //     return null;
  //   }

  //   name = data.name;
  // }

  if (!('status' in data) || !isPassengerStatus(data.status)) {
    console.error('Invalid status for passenger', data);
    return null;
  }
  const status = data.status;

  if (
    !('numberOfPassengers' in data) ||
    typeof data.numberOfPassengers !== 'number'
  ) {
    console.error('Invalid number of passengers for passenger', data);
    return null;
  }
  const numberOfPassengers = data.numberOfPassengers;

  if (!('previousLegs' in data) || !Array.isArray(data.previousLegs)) {
    console.error('Invalid previous legs in passenger', data);
    return null;
  }
  const previousLegs = data.previousLegs.map(extractLeg);
  if (!previousLegs.every((leg) => leg !== null)) {
    const firstInvalidLeg = previousLegs.find((leg) => leg === null);
    console.error(
      'Invalid previous legs, including',
      firstInvalidLeg,
      'in passenger',
      data,
    );
    return null;
  }

  let currentLeg: Leg | null = null;
  if ('currentLeg' in data) {
    currentLeg = extractLeg(data.currentLeg);

    if (currentLeg === null) {
      console.error('Invalid current leg in passenger', data);
      return null;
    }
  }

  if (!('nextLegs' in data) || !Array.isArray(data.nextLegs)) {
    console.error('Invalid next legs in passenger', data);
    return null;
  }
  const nextLegs = data.nextLegs.map(extractLeg);
  if (!nextLegs.every((leg) => leg !== null)) {
    const firstInvalidLeg = nextLegs.find((leg) => leg === null);
    console.error(
      'Invalid next legs, including',
      firstInvalidLeg,
      'in passenger',
      data,
    );
    return null;
  }

  let tags: EntityMetadata['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      console.error('Invalid tags', data.tags, 'in passenger', data);
      return null;
    }

    tags = data.tags.sort((a, b) => a.localeCompare(b));
  }

  return {
    id,
    name,
    entityType: 'passenger',
    status,
    previousLegs,
    currentLeg,
    nextLegs,
    numberOfPassengers,
    tags,
    error: null, // Initially no error
  };
}

// We need to use a generic here to handle different leg types of extending interfaces.
export function getAllLegs<P extends Passenger>(
  passenger: P,
): P['previousLegs'] {
  passenger.previousLegs.forEach((leg) => (leg.legType = 'previous'));
  if (passenger.currentLeg !== null) {
    passenger.currentLeg.legType = 'current';
  }
  passenger.nextLegs.forEach((leg) => (leg.legType = 'next'));

  return passenger.previousLegs.concat(
    passenger.currentLeg === null ? [] : [passenger.currentLeg],
    passenger.nextLegs,
  );
}

export function getPassengerCurrentStopIdWithVehicleId(
  passenger: Passenger,
  timestamp: number,
): {
  stopId: string;
  vehicleId: string;
} | null {
  const leg =
    passenger.currentLeg ??
    passenger.nextLegs[0] ??
    passenger.previousLegs[passenger.previousLegs.length - 1] ??
    null;

  if (leg === null) {
    return null;
  }

  if (leg.assignedVehicleId === null) {
    return null;
  }

  // Is at boarding stop
  if (leg.boardingTime === null || leg.boardingTime > timestamp) {
    return leg.boardingStopId === null
      ? null
      : { stopId: leg.boardingStopId, vehicleId: leg.assignedVehicleId };
  }

  // Is between boarding and alighting stop
  if (leg.alightingTime === null || leg.alightingTime > timestamp) {
    return null;
  }

  // Is at alighting stop
  return leg.alightingStopId === null
    ? null
    : { stopId: leg.alightingStopId, vehicleId: leg.assignedVehicleId };
}

export function getPassengerCurrentVehicleId(
  passenger: Passenger,
  timestamp: number,
): string | null {
  const leg =
    passenger.currentLeg ??
    passenger.nextLegs[0] ??
    passenger.previousLegs[passenger.previousLegs.length - 1] ??
    null;

  if (leg === null) {
    return null;
  }

  // Is at boarding stop
  if (leg.boardingTime === null || leg.boardingTime > timestamp) {
    return null;
  }

  // Is between boarding and alighting stop
  if (leg.alightingTime === null || leg.alightingTime > timestamp) {
    return leg.assignedVehicleId;
  }

  // Is at alighting stop
  return null;
}

export function isPassengerAtStop(
  passenger: Passenger,
  stopId: string,
  timestamp: number,
): boolean {
  const leg =
    passenger.currentLeg ??
    passenger.nextLegs[0] ??
    passenger.previousLegs[passenger.previousLegs.length - 1] ??
    null;

  if (leg === null) {
    return false;
  }

  // Is at boarding stop
  if (leg.boardingTime === null || leg.boardingTime > timestamp) {
    return stopId === leg.boardingStopId;
  }

  // Is between boarding and alighting stop
  if (leg.alightingTime === null || leg.alightingTime > timestamp) {
    return false;
  }

  // Is at alighting stop
  return stopId === leg.alightingStopId;
}

export function isPassengerOnVehicle(
  passenger: Passenger,
  vehicleId: string,
  timestamp: number,
): boolean {
  const leg =
    passenger.currentLeg ??
    passenger.nextLegs[0] ??
    passenger.previousLegs[passenger.previousLegs.length - 1] ??
    null;

  if (leg === null) {
    return false;
  }

  // Is at boarding stop
  if (leg.boardingTime === null || leg.boardingTime > timestamp) {
    return false;
  }

  // Is between boarding and alighting stop
  if (leg.alightingTime === null || leg.alightingTime > timestamp) {
    return leg.assignedVehicleId === vehicleId;
  }

  // Is at alighting stop
  return false;
}
