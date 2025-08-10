export interface Statistics {
  [key: string]: string | number | Statistics;
}

export function isStatistics(value: unknown): value is Statistics {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  for (const v of Object.values(value)) {
    if (typeof v !== 'string' && typeof v !== 'number' && !isStatistics(v)) {
      return false;
    }
  }

  return true;
}
