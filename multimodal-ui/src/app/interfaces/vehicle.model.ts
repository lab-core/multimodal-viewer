import { EntityMetadata } from './entity.model';
import { extractStop, Stop } from './stop.model';
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

export function extractVehicle(data: unknown): Vehicle | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for vehicle', data);
    return null;
  }

  if (!('id' in data) || typeof data.id !== 'string') {
    console.error('Invalid ID for vehicle', data);
    return null;
  }
  const id = data.id;

  if (!('name' in data) || typeof data.name !== 'string') {
    console.error('Invalid name for vehicle', data);
    return null;
  }
  const name = data.name;

  let mode = null;
  if ('mode' in data) {
    if (typeof data.mode !== 'string') {
      console.error('Invalid mode for vehicle', data.mode, 'in vehicle', data);
      return null;
    }

    mode = data.mode;
  }

  if (!('status' in data) || !isVehicleStatus(data.status)) {
    console.error('Invalid status for vehicle', data);
    return null;
  }
  const status = data.status;

  if (!('previousStops' in data) || !Array.isArray(data.previousStops)) {
    console.error('Invalid previous stops for vehicle', data);
    return null;
  }
  const previousStops = data.previousStops.map((stop) => extractStop(stop, id));
  if (!previousStops.every((stop) => stop !== null)) {
    const firstInvalidStop = previousStops.find((stop) => stop === null);
    console.error(
      'Invalid previous stops, including',
      firstInvalidStop,
      'in vehicle',
      data,
    );
    return null;
  }

  let currentStop: Stop | null = null;
  if ('currentStop' in data) {
    currentStop = extractStop(data.currentStop, id);

    if (currentStop === null) {
      console.error('Invalid current stop for vehicle', data);
      return null;
    }
  }

  if (!('nextStops' in data) || !Array.isArray(data.nextStops)) {
    console.error('Invalid next stops for vehicle', data);
    return null;
  }
  const nextStops = data.nextStops.map((stop) => extractStop(stop, id));
  if (!nextStops.every((stop) => stop !== null)) {
    const firstInvalidStop = nextStops.find((stop) => stop === null);
    console.error(
      'Invalid next stops, including',
      firstInvalidStop,
      'in vehicle',
      data,
    );
    return null;
  }

  if (!('capacity' in data) || typeof data.capacity !== 'number') {
    console.error('Invalid capacity for vehicle', data);
    return null;
  }
  const capacity = data.capacity;

  let tags: EntityMetadata['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      console.error('Invalid tags', data.tags, 'for vehicle', data);
      return null;
    }

    tags = data.tags.sort((a, b) => a.localeCompare(b));
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
    error: null, // Initially no error
    isFavorite: false, // Initially not favorite
  };
}

export function getAllStops(vehicle: Vehicle): Stop[] {
  vehicle.previousStops.forEach((stop) => (stop.stopType = 'previous'));
  if (vehicle.currentStop !== null) {
    vehicle.currentStop.stopType = 'current';
  }
  vehicle.nextStops.forEach((stop) => (stop.stopType = 'next'));

  return vehicle.previousStops.concat(
    vehicle.currentStop === null ? [] : [vehicle.currentStop],
    vehicle.nextStops,
  );
}
