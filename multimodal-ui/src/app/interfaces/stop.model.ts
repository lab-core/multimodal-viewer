import { EntityMetadata, isEntityMetadata } from './entity.model';
import { isPosition, Position } from './position.model';
import { isTagged } from './tags.model';

export type StopType = 'previous' | 'current' | 'next';

export const STOP_TYPES: StopType[] = ['previous', 'current', 'next'];

export function isStopType(value: unknown): value is StopType {
  return STOP_TYPES.includes(value as StopType);
}

export const DEFAULT_STOP_CAPACITY = 10;

export interface Stop extends EntityMetadata {
  stopType: StopType;
  arrivalTime: number;
  departureTime: number | null; // null means infinite
  position: Position;
  capacity: number;
  label: string;
}

export function getStopId(stopOrPosition: Stop | Position): string {
  const position = isPosition(stopOrPosition)
    ? stopOrPosition
    : stopOrPosition.position;
  return '' + position.latitude + ',' + position.longitude;
}

export function isStop(value: unknown): value is Stop {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!isEntityMetadata(value) || value.entityType !== 'stop') {
    return false;
  }

  if (!('stopType' in value) || !isStopType(value.stopType)) {
    return false;
  }

  if (!('arrivalTime' in value) || typeof value.arrivalTime !== 'number') {
    return false;
  }

  if (
    !('departureTime' in value) ||
    (value.departureTime !== null && typeof value.departureTime !== 'number')
  ) {
    return false;
  }

  if (!('position' in value) || !isPosition(value.position)) {
    return false;
  }

  if (!('capacity' in value) || typeof value.capacity !== 'number') {
    return false;
  }

  if (!('label' in value) || typeof value.label !== 'string') {
    return false;
  }

  return true;
}

export function extractStop(data: unknown): Stop | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  let tags: Stop['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      return null;
    }

    tags = data.tags;
  }

  if (!('stopType' in data) || !isStopType(data.stopType)) {
    return null;
  }
  const stopType = data.stopType;

  if (!('arrivalTime' in data) || typeof data.arrivalTime !== 'number') {
    return null;
  }
  const arrivalTime = data.arrivalTime;

  let departureTime: Stop['departureTime'] = null;
  if ('departureTime' in data) {
    if (data.departureTime !== null && typeof data.departureTime !== 'number') {
      return null;
    }

    departureTime = data.departureTime;
  }

  if (!('position' in data) || !isPosition(data.position)) {
    return null;
  }
  const position = data.position;

  let capacity = DEFAULT_STOP_CAPACITY;
  if ('capacity' in data) {
    if (typeof data.capacity !== 'number') {
      return null;
    }

    capacity = data.capacity;
  }

  if (!('label' in data) || typeof data.label !== 'string') {
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
  };
}
