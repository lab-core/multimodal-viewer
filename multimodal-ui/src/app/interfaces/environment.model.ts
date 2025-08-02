import { Passenger } from './passenger.model';
import { Statistics } from './statistics.model';
import { Vehicle } from './vehicle.model';

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
