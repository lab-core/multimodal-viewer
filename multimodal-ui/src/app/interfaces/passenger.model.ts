import getName from 'node-random-name';
import { EntityMetadata, isEntityMetadata } from './entity.model';
import { extractLeg, isLeg, Leg } from './leg.model';
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

export function isPassenger(value: unknown): value is Passenger {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!isEntityMetadata(value) || value.entityType !== 'passenger') {
    return false;
  }

  if (!('status' in value) || !isPassengerStatus(value.status)) {
    return false;
  }

  if (
    !('previousLegs' in value) ||
    !Array.isArray(value.previousLegs) ||
    !value.previousLegs.every(isLeg)
  ) {
    return false;
  }

  if (
    !('currentLeg' in value) ||
    (value.currentLeg !== null && !isLeg(value.currentLeg))
  ) {
    return false;
  }

  if (
    !('nextLegs' in value) ||
    !Array.isArray(value.nextLegs) ||
    !value.nextLegs.every(isLeg)
  ) {
    return false;
  }

  if (
    !('numberOfPassengers' in value) ||
    typeof value.numberOfPassengers !== 'number'
  ) {
    return false;
  }

  return true;
}

export function extractPassenger(data: unknown): Passenger | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  if (!('id' in data) || typeof data.id !== 'string') {
    return null;
  }
  const id = data.id;

  let name = getName({ seed: id });
  if ('name' in data) {
    if (typeof data.name !== 'string') {
      return null;
    }

    name = data.name;
  }

  if (!('status' in data) || !isPassengerStatus(data.status)) {
    return null;
  }
  const status = data.status;

  if (
    !('numberOfPassengers' in data) ||
    typeof data.numberOfPassengers !== 'number'
  ) {
    return null;
  }
  const numberOfPassengers = data.numberOfPassengers;

  if (!('previousLegs' in data) || !Array.isArray(data.previousLegs)) {
    return null;
  }
  const previousLegs = data.previousLegs.map(extractLeg);
  if (!previousLegs.every(isLeg)) {
    return null;
  }

  let currentLeg: Leg | null = null;
  if ('currentLeg' in data) {
    currentLeg = extractLeg(data.currentLeg);

    if (!isLeg(currentLeg)) {
      return null;
    }
  }

  if (!('nextLegs' in data) || !Array.isArray(data.nextLegs)) {
    return null;
  }
  const nextLegs = data.nextLegs.map(extractLeg);
  if (!nextLegs.every(isLeg)) {
    return null;
  }

  let tags: EntityMetadata['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      return null;
    }

    tags = data.tags;
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
  };
}

// We need to use a generic here to handle different leg types of extending interfaces.
export function getAllLegs<P extends Passenger>(
  passenger: P,
): P['previousLegs'] {
  return passenger.previousLegs.concat(
    passenger.currentLeg === null ? [] : [passenger.currentLeg],
    passenger.nextLegs,
  );
}
