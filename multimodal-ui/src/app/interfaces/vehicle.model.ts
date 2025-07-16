import { EntityMetadata, isEntityMetadata } from './entity.model';
import { extractStop, isStop, Stop } from './stop.model';
import { isTagged } from './tags.model';

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

export function isVehicleStatus(value: unknown): value is VehicleStatus {
  return VEHICLE_STATUSES.includes(value as VehicleStatus);
}

export interface Vehicle extends EntityMetadata {
  mode: string | null;
  status: VehicleStatus;
  previousStops: Stop[];
  currentStop: Stop | null;
  nextStops: Stop[];
  capacity: number;
}

export function isVehicle(value: unknown): value is Vehicle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!isEntityMetadata(value) || value.entityType !== 'vehicle') {
    return false;
  }

  if (
    !('mode' in value) ||
    (value.mode !== null && typeof value.mode !== 'string')
  ) {
    return false;
  }

  if (!('status' in value) || !isVehicleStatus(value.status)) {
    return false;
  }

  if (
    !('previousStops' in value) ||
    !Array.isArray(value.previousStops) ||
    !value.previousStops.every(isStop)
  ) {
    return false;
  }

  if (
    !('currentStop' in value) ||
    (value.currentStop !== null && !isStop(value.currentStop))
  ) {
    return false;
  }

  if (
    !('nextStops' in value) ||
    !Array.isArray(value.nextStops) ||
    !value.nextStops.every(isStop)
  ) {
    return false;
  }

  if (!('capacity' in value) || typeof value.capacity !== 'number') {
    return false;
  }

  return true;
}

export function extractVehicle(data: unknown): Vehicle | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  if (!('id' in data) || typeof data.id !== 'string') {
    return null;
  }
  const id = data.id;

  if (!('name' in data) || typeof data.name !== 'string') {
    return null;
  }
  const name = data.name;

  let mode = null;
  if ('mode' in data) {
    if (typeof data.mode !== 'string') {
      return null;
    }

    mode = data.mode;
  }

  if (!('status' in data) || !isVehicleStatus(data.status)) {
    return null;
  }
  const status = data.status;

  if (!('previousStops' in data) || !Array.isArray(data.previousStops)) {
    return null;
  }
  const previousStops = data.previousStops.map(extractStop);
  if (!previousStops.every(isStop)) {
    return null;
  }

  let currentStop: Stop | null = null;
  if ('currentStop' in data) {
    currentStop = extractStop(data.currentStop);

    if (!isStop(currentStop)) {
      return null;
    }
  }

  if (!('nextStops' in data) || !Array.isArray(data.nextStops)) {
    return null;
  }
  const nextStops = data.nextStops.map(extractStop);
  if (!nextStops.every(isStop)) {
    return null;
  }

  if (!('capacity' in data) || typeof data.capacity !== 'number') {
    return null;
  }
  const capacity = data.capacity;

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
    entityType: 'vehicle',
    mode,
    status,
    previousStops,
    currentStop,
    nextStops,
    capacity,
    tags,
  };
}

export function getAllStops(vehicle: Vehicle): Stop[] {
  return vehicle.previousStops.concat(
    vehicle.currentStop === null ? [] : [vehicle.currentStop],
    vehicle.nextStops,
  );
}
