import { isTagged, Tagged } from './tags.model';

export type LegType = 'previous' | 'current' | 'next';

export const LEG_TYPES: LegType[] = ['previous', 'current', 'next'];

export function isLegType(value: unknown): value is LegType {
  return LEG_TYPES.includes(value as LegType);
}

export interface Leg extends Tagged {
  legType: LegType;
  assignedVehicleId: string | null;
  boardingStopIndex: number | null;
  alightingStopIndex: number | null;
  boardingTime: number | null;
  alightingTime: number | null;
}

export function isLeg(value: unknown): value is Leg {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!isTagged(value)) {
    return false;
  }

  if (!('legType' in value) || !isLegType(value.legType)) {
    return false;
  }

  if (
    !('assignedVehicleId' in value) ||
    (value.assignedVehicleId !== null &&
      typeof value.assignedVehicleId !== 'string')
  ) {
    return false;
  }

  if (
    !('boardingStopIndex' in value) ||
    (value.boardingStopIndex !== null &&
      typeof value.boardingStopIndex !== 'number')
  ) {
    return false;
  }

  if (
    !('alightingStopIndex' in value) ||
    (value.alightingStopIndex !== null &&
      typeof value.alightingStopIndex !== 'number')
  ) {
    return false;
  }

  if (
    !('boardingTime' in value) ||
    (value.boardingTime !== null && typeof value.boardingTime !== 'number')
  ) {
    return false;
  }

  if (
    !('alightingTime' in value) ||
    (value.alightingTime !== null && typeof value.alightingTime !== 'number')
  ) {
    return false;
  }

  return true;
}

export function extractLeg(data: unknown): Leg | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  let tags: Leg['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      return null;
    }

    tags = data.tags;
  }

  if (!('legType' in data) || !isLegType(data.legType)) {
    return null;
  }
  const legType = data.legType;

  let assignedVehicleId: Leg['assignedVehicleId'] = null;
  if ('assignedVehicleId' in data) {
    if (
      data.assignedVehicleId !== null &&
      typeof data.assignedVehicleId !== 'string'
    ) {
      return null;
    }
    assignedVehicleId = data.assignedVehicleId;
  }

  let boardingStopIndex: Leg['boardingStopIndex'] = null;
  if ('boardingStopIndex' in data) {
    if (
      data.boardingStopIndex !== null &&
      typeof data.boardingStopIndex !== 'number'
    ) {
      return null;
    }
    boardingStopIndex = data.boardingStopIndex;
  }

  let alightingStopIndex: Leg['alightingStopIndex'] = null;
  if ('alightingStopIndex' in data) {
    if (
      data.alightingStopIndex !== null &&
      typeof data.alightingStopIndex !== 'number'
    ) {
      return null;
    }
    alightingStopIndex = data.alightingStopIndex;
  }

  let boardingTime: Leg['boardingTime'] = null;
  if ('boardingTime' in data) {
    if (data.boardingTime !== null && typeof data.boardingTime !== 'number') {
      return null;
    }
    boardingTime = data.boardingTime;
  }

  let alightingTime: Leg['alightingTime'] = null;
  if ('alightingTime' in data) {
    if (data.alightingTime !== null && typeof data.alightingTime !== 'number') {
      return null;
    }
    alightingTime = data.alightingTime;
  }

  return {
    tags,
    legType,
    assignedVehicleId,
    boardingStopIndex,
    alightingStopIndex,
    boardingTime,
    alightingTime,
  };
}
