export interface Position {
  latitude: number;
  longitude: number;
}

export function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('latitude' in value) || typeof value.latitude !== 'number') {
    return false;
  }

  if (!('longitude' in value) || typeof value.longitude !== 'number') {
    return false;
  }

  return true;
}
