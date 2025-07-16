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

  if (!('passengers' in data) || !Array.isArray(data.passengers)) {
    console.error('Invalid passengers in simulation environment', data);
    return null;
  }

  const passengers: Record<string, Passenger> = {};
  for (const serializedPassenger of data.passengers) {
    const passenger = extractPassenger(serializedPassenger);

    if (passenger === null) {
      console.error(
        `Invalid passenger`,
        serializedPassenger,
        ' in simulation environment',
        data,
      );
      return null;
    }

    passengers[passenger.id] = passenger;
  }

  if (!('vehicles' in data) || !Array.isArray(data.vehicles)) {
    console.error('Invalid vehicles in simulation environment', data);
    return null;
  }

  const vehicles: Record<string, Vehicle> = {};
  for (const serializedVehicle of data.vehicles) {
    const vehicle = extractVehicle(serializedVehicle);

    if (vehicle === null) {
      console.error(
        `Invalid vehicle`,
        serializedVehicle,
        ' in simulation environment',
        data,
      );
      return null;
    }

    vehicles[vehicle.id] = vehicle;
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
