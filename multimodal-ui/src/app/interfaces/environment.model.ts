import { extractPassenger, Passenger } from './passenger.model';
import { isStatistics, Statistics } from './statistics.model';
import { extractVehicle, Vehicle } from './vehicle.model';

/**
 * Snapshot of the simulation environment at a given time
 */
export interface SimulationEnvironment {
  passengers: Record<string, Passenger>;
  vehicles: Record<string, Vehicle>;
  statistics: Statistics;

  /**
   * The timestamp of the last update before the snapshot
   */
  timestamp: number;

  /**
   * The index of the last update before the snapshot
   */
  updateIndex: number;
}

export function extractSimulationEnvironment(
  data: unknown,
): SimulationEnvironment | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for simulation environment', data);
    return null;
  }

  if (
    !('passengers' in data) ||
    typeof data.passengers !== 'object' ||
    data.passengers === null
  ) {
    console.error('Invalid passengers in simulation environment', data);
    return null;
  }

  const passengers: Record<string, Passenger> = {};
  for (const [key, value] of Object.entries(data.passengers)) {
    const passenger = extractPassenger(value);

    if (passenger === null) {
      console.error(
        `Invalid passenger for key ${key}`,
        value,
        ' in simulation environment',
        data,
      );
      return null;
    }

    passengers[key] = passenger;
  }

  if (
    !('vehicles' in data) ||
    typeof data.vehicles !== 'object' ||
    data.vehicles === null
  ) {
    console.error('Invalid vehicles in simulation environment', data);
    return null;
  }

  const vehicles: Record<string, Vehicle> = {};
  for (const [key, value] of Object.entries(data.vehicles)) {
    const vehicle = extractVehicle(value);

    if (vehicle === null) {
      console.error(
        `Invalid vehicle for key ${key}`,
        value,
        ' in simulation environment',
        data,
      );
      return null;
    }

    vehicles[key] = vehicle;
  }

  if (!('statistics' in data) || !isStatistics(data.statistics)) {
    console.error('Invalid statistics in simulation environment', data);
    return null;
  }

  if (!('timestamp' in data) || typeof data.timestamp !== 'number') {
    console.error('Invalid timestamp in simulation environment', data);
    return null;
  }

  if (!('updateIndex' in data) || typeof data.updateIndex !== 'number') {
    console.error('Invalid updateIndex in simulation environment', data);
    return null;
  }

  return {
    passengers,
    vehicles,
    statistics: data.statistics,
    timestamp: data.timestamp,
    updateIndex: data.updateIndex,
  };
}
