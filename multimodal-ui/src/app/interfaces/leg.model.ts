import { isTagged, Tagged } from './tags.model';

export type LegType = 'previous' | 'current' | 'next';

export const LEG_TYPES: LegType[] = ['previous', 'current', 'next'];

export function isLegType(value: unknown): value is LegType {
  return LEG_TYPES.includes(value as LegType);
}

export interface Leg extends Tagged {
  /**
   * The type of the leg, which can be 'previous', 'current', or 'next'.
   *
   * Due to optimisations, this field should be used carefully. See `ContinuousPassenger.legs` for more details.
   */
  legType: LegType;
  assignedVehicleId: string | null;
  boardingStopId: string | null;
  alightingStopId: string | null;
  boardingStopIndex: number | null;
  alightingStopIndex: number | null;
  boardingTime: number | null;
  alightingTime: number | null;
}

export function extractLeg(data: unknown): Leg | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for leg', data);
    return null;
  }

  let tags: Leg['tags'] = [];
  if ('tags' in data) {
    if (!isTagged(data)) {
      console.error('Invalid tags in leg', data);
      return null;
    }

    tags = data.tags.sort((a, b) => a.localeCompare(b));
  }

  if (!('legType' in data) || !isLegType(data.legType)) {
    console.error('Invalid leg type', data);
    return null;
  }
  const legType = data.legType;

  let assignedVehicleId: Leg['assignedVehicleId'] = null;
  if ('assignedVehicleId' in data) {
    if (
      data.assignedVehicleId !== null &&
      typeof data.assignedVehicleId !== 'string'
    ) {
      console.error(
        'Invalid assigned vehicle ID',
        data.assignedVehicleId,
        'for leg',
        data,
      );
      return null;
    }

    assignedVehicleId = data.assignedVehicleId;
  }

  let boardingStopId: Leg['boardingStopId'] = null;
  if ('boardingStopId' in data) {
    if (
      data.boardingStopId !== null &&
      typeof data.boardingStopId !== 'string'
    ) {
      console.error(
        'Invalid boarding stop index',
        data.boardingStopId,
        'for leg',
        data,
      );
      return null;
    }

    boardingStopId = data.boardingStopId;
  }

  let alightingStopId: Leg['alightingStopId'] = null;
  if ('alightingStopId' in data) {
    if (
      data.alightingStopId !== null &&
      typeof data.alightingStopId !== 'string'
    ) {
      console.error(
        'Invalid alighting stop index',
        data.alightingStopId,
        'for leg',
        data,
      );
      return null;
    }

    alightingStopId = data.alightingStopId;
  }

  let boardingStopIndex: Leg['boardingStopIndex'] = null;
  if ('boardingStopIndex' in data) {
    if (
      data.boardingStopIndex !== null &&
      typeof data.boardingStopIndex !== 'number'
    ) {
      console.error(
        'Invalid boarding stop index',
        data.boardingStopIndex,
        'for leg',
        data,
      );
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
      console.error(
        'Invalid alighting stop index',
        data.alightingStopIndex,
        'for leg',
        data,
      );
      return null;
    }

    alightingStopIndex = data.alightingStopIndex;
  }

  let boardingTime: Leg['boardingTime'] = null;
  if ('boardingTime' in data) {
    if (data.boardingTime !== null && typeof data.boardingTime !== 'number') {
      console.error(
        'Invalid boarding time',
        data.boardingTime,
        'for leg',
        data,
      );
      return null;
    }

    boardingTime = data.boardingTime;
  }

  let alightingTime: Leg['alightingTime'] = null;
  if ('alightingTime' in data) {
    if (data.alightingTime !== null && typeof data.alightingTime !== 'number') {
      console.error(
        'Invalid alighting time',
        data.alightingTime,
        'for leg',
        data,
      );
      return null;
    }

    alightingTime = data.alightingTime;
  }

  return {
    tags,
    legType,
    assignedVehicleId,
    boardingStopId,
    alightingStopId,
    boardingStopIndex,
    alightingStopIndex,
    boardingTime,
    alightingTime,
  };
}
