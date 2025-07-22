import { EntityMetadata } from './entity.model';
import { isPosition, Position } from './position.model';
import { isTagged } from './tags.model';

export type StopType = 'previous' | 'current' | 'next';

export const STOP_TYPES: StopType[] = ['previous', 'current', 'next'];

export function isStopType(value: unknown): value is StopType {
  return STOP_TYPES.includes(value as StopType);
}

export const DEFAULT_STOP_CAPACITY = 10;

export interface Stop extends EntityMetadata {
  /**
   * The type of the stop, which can be 'previous', 'current', or 'next'.
   *
   * Due to optimisations, this field should be used carefully. See `ContinuousVehicle.stops` for more details.
   */
  stopType: StopType;
  arrivalTime: number;
  departureTime: number | null; // null means infinite
  position: Position;
  capacity: number;
  label: string;
  vehicleId: string; // The id of the vehicle the stop belongs to
}

export function getStopId(stopOrPosition: Stop | Position): string {
  const position = isPosition(stopOrPosition)
    ? stopOrPosition
    : stopOrPosition.position;
  return '' + position.latitude + ',' + position.longitude;
}

export function extractStop(data: unknown, vehicleId: string): Stop | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for stop', data);
    return null;
  }

  let tags: Stop['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      console.error('Invalid tags', data.tags, 'in stop', data);
      return null;
    }

    tags = data.tags.sort((a, b) => a.localeCompare(b));
  }

  if (!('stopType' in data) || !isStopType(data.stopType)) {
    console.error('Invalid stop type in stop', data);
    return null;
  }
  const stopType = data.stopType;

  if (!('arrivalTime' in data) || typeof data.arrivalTime !== 'number') {
    console.error('Invalid arrival time in stop', data);
    return null;
  }
  const arrivalTime = data.arrivalTime;

  let departureTime: Stop['departureTime'] = null;
  if ('departureTime' in data) {
    if (data.departureTime !== null && typeof data.departureTime !== 'number') {
      console.error(
        'Invalid departure time',
        data.departureTime,
        'in stop',
        data,
      );
      return null;
    }

    departureTime = data.departureTime;
  }

  if (!('position' in data) || !isPosition(data.position)) {
    console.error('Invalid position in stop', data);
    return null;
  }
  const position = data.position;

  let capacity = DEFAULT_STOP_CAPACITY;
  if ('capacity' in data) {
    if (typeof data.capacity !== 'number') {
      console.error('Invalid capacity', data.capacity, 'in stop', data);
      return null;
    }

    capacity = data.capacity;
  }

  if (!('label' in data) || typeof data.label !== 'string') {
    console.error('Invalid label in stop', data);
    return null;
  }
  const label = data.label;

  const id = getStopId(position);

  return {
    id,
    name: label, // Stops are displayed by their label
    entityType: 'stop',
    tags,
    stopType,
    arrivalTime,
    departureTime,
    position,
    capacity,
    label,
    vehicleId,
    error: null, // Initially no error
  };
}
