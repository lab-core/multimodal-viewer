import { SimulationEnvironment } from './environment.model';
import { Leg } from './leg.model';
import { getAllLegs, Passenger } from './passenger.model';
import { Statistics } from './statistics.model';
import { Stop } from './stop.model';
import { Tagged } from './tags.model';
import {
  PassengerUpdate,
  StatisticsUpdate,
  Update,
  VehicleUpdate,
} from './update.model';
import { getAllStops, Vehicle } from './vehicle.model';

// MARK: Types
export interface EntityState {
  startTimestamp: number;
  endTimestamp: number;
  updateIndex: number;
}

export interface PassengerState extends EntityState, Passenger {}

export interface VehicleState extends EntityState, Vehicle {}

export interface StatisticsState extends EntityState {
  statistics: Statistics;
}

export interface ContinuousEnvironment {
  passengers: Record<string, PassengerState[]>;
  vehicles: Record<string, VehicleState[]>;
  statistics: StatisticsState[];
  startTimestamp: number;
  startUpdateIndex: number;
  endTimestamp: number;
  endUpdateIndex: number;
}

export interface EnvironmentSlice extends SimulationEnvironment {
  /**
   * Dictionary of all stops in the environment at the given timestamp.
   *
   * There might be more stops in every vehicle than in this object because
   * they are stored by location. This is only for the display and animation
   * since we want to group the passengers and vehicle at the same "physical" stop.
   */
  stops: Record<string, Stop>;
}

/**
 * A container for all instances of the continuous simulation environment.
 *
 * This is used to limit the number of instances to save memory.
 */
export interface ContinuousEnvironmentReferences {
  /**
   * All existing versions of all tags of all passengers.
   */
  passengerTags: string[][];

  /**
   * All existing versions of all tags of all vehicles.
   */
  vehicleTags: string[][];

  /**
   * All existing versions of all tags of all stops.
   */
  stopTags: string[][];

  /**
   * All existing versions of all legs of all passengers.
   */
  legTags: string[][];

  /**
   * All existing versions of all legs of each passenger.
   */
  passengerLegs: Record<string, Leg[]>;

  /**
   * All existing versions of all stops of each vehicle.
   */
  vehicleStops: Record<string, Stop[]>;
}

export function createContinuousEnvironmentReferences(): ContinuousEnvironmentReferences {
  return {
    passengerTags: [],
    vehicleTags: [],
    stopTags: [],
    legTags: [],
    passengerLegs: {},
    vehicleStops: {},
  };
}

// MARK: Build Environment
/**
 * Builds a continuous simulation environment from the initial environment and the updates.
 *
 * This function will apply the updates to the initial environment, modifying it in place.
 *
 * @param environment the initial environment on which the updates will be applied
 * @param updates the updates to apply to the environment
 */
export function buildContinuousEnvironment(
  environment: SimulationEnvironment,
  updates: Update[],
  references: ContinuousEnvironmentReferences,
) {
  const startTimestamp = environment.timestamp;
  const startUpdateIndex = environment.updateIndex;

  const lastUpdate = updates[updates.length - 1];
  const endTimestamp = lastUpdate.timestamp;
  const endUpdateIndex = lastUpdate.updateIndex + 1; // We want the index of the next update

  const continuousEnvironment: ContinuousEnvironment = {
    passengers: {},
    vehicles: {},
    statistics: [],
    startTimestamp,
    startUpdateIndex,
    endTimestamp,
    endUpdateIndex,
  };

  // Build initial environment
  for (const passenger of Object.values(environment.passengers)) {
    updateContinuousPassenger(
      continuousEnvironment.passengers,
      passenger,
      startTimestamp,
      endTimestamp,
      environment.updateIndex,
      references,
    );
  }

  for (const vehicle of Object.values(environment.vehicles)) {
    updateContinuousVehicle(
      continuousEnvironment.vehicles,
      vehicle,
      startTimestamp,
      endTimestamp,
      environment.updateIndex,
      references,
    );
  }

  updateContinuousStatistics(
    continuousEnvironment.statistics,
    environment.statistics,
    startTimestamp,
    endTimestamp,
    environment.updateIndex,
  );

  // Apply each update and update the continuous environment
  const visitor = new UpdateVisitor(
    environment,
    continuousEnvironment,
    endTimestamp,
    references,
  );

  for (const update of updates) {
    visitor.visitUpdate(update);
  }

  // Adjust all end timestamps
  for (const passenger of Object.values(continuousEnvironment.passengers)) {
    const lastState = passenger[passenger.length - 1];
    if (lastState) {
      lastState.endTimestamp = endTimestamp;
    }
  }

  for (const vehicle of Object.values(continuousEnvironment.vehicles)) {
    const lastState = vehicle[vehicle.length - 1];
    if (lastState) {
      lastState.endTimestamp = endTimestamp;
    }
  }

  const lastStatistics =
    continuousEnvironment.statistics[
      continuousEnvironment.statistics.length - 1
    ];
  if (lastStatistics) {
    lastStatistics.endTimestamp = endTimestamp;
  }

  return continuousEnvironment;
}

// MARK: Visitor
class UpdateVisitor implements UpdateVisitor {
  constructor(
    private readonly environment: SimulationEnvironment,
    private readonly continuousEnvironment: ContinuousEnvironment,
    private readonly endTimestamp: number,
    private readonly references: ContinuousEnvironmentReferences,
  ) {}

  visitUpdate(update: Update): void {
    update.apply(this.environment);

    update.accept(this);
  }

  visitPassengerUpdate(update: PassengerUpdate): void {
    const passenger = this.environment.passengers[update.passengerId];

    updateContinuousPassenger(
      this.continuousEnvironment.passengers,
      passenger,
      update.timestamp,
      this.continuousEnvironment.endTimestamp,
      update.updateIndex,
      this.references,
    );
  }

  visitVehicleUpdate(update: VehicleUpdate): void {
    const vehicle = this.environment.vehicles[update.vehicleId];

    updateContinuousVehicle(
      this.continuousEnvironment.vehicles,
      vehicle,
      update.timestamp,
      this.continuousEnvironment.endTimestamp,
      update.updateIndex,
      this.references,
    );
  }

  visitStatisticsUpdate(update: StatisticsUpdate): void {
    updateContinuousStatistics(
      this.continuousEnvironment.statistics,
      update.statistics,
      update.timestamp,
      this.continuousEnvironment.endTimestamp,
      update.updateIndex,
    );
  }
}

// MARK: Append State
function updateContinuousPassenger(
  passengersStates: Record<string, PassengerState[]>,
  passenger: Passenger,
  startTimestamp: number,
  endTimestamp: number,
  updateIndex: number,
  references: ContinuousEnvironmentReferences,
): void {
  // Get current continuous passenger
  let passengerStates = passengersStates[passenger.id];

  if (!passengerStates) {
    passengerStates = [];
    passengersStates[passenger.id] = passengerStates;
  }

  // Update previous state
  const previousState = passengerStates[passengerStates.length - 1];
  if (previousState !== undefined) {
    if (previousState.startTimestamp === startTimestamp) {
      passengerStates.pop();
    } else {
      previousState.endTimestamp = startTimestamp;
    }
  }

  // Create new state
  const newState: PassengerState = {
    ...passenger,
    startTimestamp,
    endTimestamp,
    updateIndex,
  };

  // Optimize space
  optimizePassenger(newState, references);

  // Add new state
  passengerStates.push(newState);
}

function updateContinuousVehicle(
  vehiclesStates: Record<string, VehicleState[]>,
  vehicle: Vehicle,
  startTimestamp: number,
  endTimestamp: number,
  updateIndex: number,
  references: ContinuousEnvironmentReferences,
): void {
  // Get current continuous vehicle
  let vehicleStates = vehiclesStates[vehicle.id];

  if (!vehicleStates) {
    vehicleStates = [];
    vehiclesStates[vehicle.id] = vehicleStates;
  }

  // Update previous state
  const previousState = vehicleStates[vehicleStates.length - 1];
  if (previousState !== undefined) {
    if (previousState.startTimestamp === startTimestamp) {
      vehicleStates.pop();
    } else {
      previousState.endTimestamp = startTimestamp;
    }
  }

  // Create new state
  const newState: VehicleState = {
    ...vehicle,
    startTimestamp,
    endTimestamp,
    updateIndex,
  };

  // Optimize space
  optimizeVehicle(newState, references);

  // Add new state
  vehicleStates.push(newState);
}

function updateContinuousStatistics(
  continuousStatistics: StatisticsState[],
  statistics: Statistics,
  startTimestamp: number,
  endTimestamp: number,
  updateIndex: number,
): void {
  // Update previous state
  const previousState = continuousStatistics[continuousStatistics.length - 1];
  if (previousState !== undefined) {
    if (previousState.startTimestamp === startTimestamp) {
      continuousStatistics.pop();
    } else {
      previousState.endTimestamp = startTimestamp;
    }
  }

  // Create new state
  const newState: StatisticsState = {
    statistics,
    startTimestamp: startTimestamp,
    endTimestamp: endTimestamp,
    updateIndex,
  };

  // Add new state
  continuousStatistics.push(newState);
}

// MARK: Optimizations
function optimizeTags(allTags: string[][], taggedObject: Tagged): void {
  const tags = taggedObject.tags;
  let existingTags = allTags.find((existing) =>
    areTagArraysEqual(existing, tags),
  );

  if (!existingTags) {
    const clone = [...tags];
    allTags.push(clone);
    existingTags = clone;
  }

  taggedObject.tags = existingTags;
}

function optimizeLeg(legs: Leg[], leg: Leg): Leg {
  const existingLeg = legs.find((existing) => areLegsEqual(existing, leg));

  if (existingLeg) {
    return existingLeg;
  }

  // If not, create a new leg
  const clone: Leg = {
    ...leg,
  };

  legs.push(clone);
  return clone;
}

function optimizeLegs(legs: Leg[], passengerState: PassengerState): void {
  const newPreviousLegs = passengerState.previousLegs.map((leg) =>
    optimizeLeg(legs, leg),
  );
  const newCurrentLeg = passengerState.currentLeg
    ? optimizeLeg(legs, passengerState.currentLeg)
    : null;
  const newNextLegs = passengerState.nextLegs.map((leg) =>
    optimizeLeg(legs, leg),
  );

  passengerState.previousLegs = newPreviousLegs;
  passengerState.currentLeg = newCurrentLeg;
  passengerState.nextLegs = newNextLegs;
}

function optimizeStop(stops: Stop[], stop: Stop): Stop {
  // const existingStop = stops.find((existing) => areStopsEqual(existing, stop));
  const existingStopIndex = findStopIndexBS(stops, stop);

  if (existingStopIndex !== null) {
    return stops[existingStopIndex];
  }

  // If not, create a new stop
  const clone: Stop = {
    ...stop,
  };

  insertStopBS(stops, clone);

  return clone;
}

function optimizeStops(stops: Stop[], vehicle: Vehicle): void {
  const newPreviousStops = vehicle.previousStops.map((stop) =>
    optimizeStop(stops, stop),
  );
  const newCurrentStop = vehicle.currentStop
    ? optimizeStop(stops, vehicle.currentStop)
    : null;
  const newNextStops = vehicle.nextStops.map((stop) =>
    optimizeStop(stops, stop),
  );

  vehicle.previousStops = newPreviousStops;
  vehicle.currentStop = newCurrentStop;
  vehicle.nextStops = newNextStops;
}

function optimizePassenger(
  passengerState: PassengerState,
  references: ContinuousEnvironmentReferences,
): void {
  optimizeTags(references.passengerTags, passengerState);

  let legs = references.passengerLegs[passengerState.id];
  if (!legs) {
    legs = [];
    references.passengerLegs[passengerState.id] = legs;
  }
  optimizeLegs(legs, passengerState);

  const allLegs = getAllLegs(passengerState);
  for (const leg of allLegs) {
    optimizeTags(references.legTags, leg);
  }
}

function optimizeVehicle(
  vehicleState: VehicleState,
  references: ContinuousEnvironmentReferences,
): void {
  optimizeTags(references.vehicleTags, vehicleState);

  let stops = references.vehicleStops[vehicleState.id];
  if (!stops) {
    stops = [];
    references.vehicleStops[vehicleState.id] = stops;
  }

  optimizeStops(stops, vehicleState);

  const allStops = getAllStops(vehicleState);
  for (const stop of allStops) {
    optimizeTags(references.stopTags, stop);
  }
}

// MARK: Compare
function areTagArraysEqual(array1: string[], array2: string[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }

  // All tags arrays are sorted, so we can use a simple check
  // to see if all tags in array1 are in array2.
  for (let i = 0; i < array1.length; i++) {
    if (array1[i] !== array2[i]) {
      return false;
    }
  }

  return true;
}

function areLegsEqual(leg1: Leg, leg2: Leg): boolean {
  // Compare all fields except legType
  return (
    leg1.assignedVehicleId === leg2.assignedVehicleId &&
    leg1.boardingStopId === leg2.boardingStopId &&
    leg1.alightingStopId === leg2.alightingStopId &&
    leg1.boardingStopIndex === leg2.boardingStopIndex &&
    leg1.alightingStopIndex === leg2.alightingStopIndex &&
    leg1.boardingTime === leg2.boardingTime &&
    leg1.alightingTime === leg2.alightingTime &&
    areTagArraysEqual(leg1.tags, leg2.tags)
  );
}

function areStopsEqual(stop1: Stop, stop2: Stop): boolean {
  // Compare all fields except stopType and entityType
  return (
    stop1.id === stop2.id &&
    stop1.name === stop2.name &&
    stop1.arrivalTime === stop2.arrivalTime &&
    stop1.departureTime === stop2.departureTime &&
    stop1.position.latitude === stop2.position.latitude &&
    stop1.position.longitude === stop2.position.longitude &&
    stop1.capacity === stop2.capacity &&
    stop1.label === stop2.label &&
    areTagArraysEqual(stop1.tags, stop2.tags)
  );
}

// MARK: Merge
export function mergeContinuousEnvironments(
  firstEnvironment: ContinuousEnvironment,
  secondEnvironment: ContinuousEnvironment,
): ContinuousEnvironment {
  firstEnvironment.endTimestamp = secondEnvironment.endTimestamp;
  firstEnvironment.endUpdateIndex = secondEnvironment.endUpdateIndex;

  for (const passengerId in secondEnvironment.passengers) {
    const passengerStates = secondEnvironment.passengers[passengerId];

    if (firstEnvironment.passengers[passengerId] === undefined) {
      firstEnvironment.passengers[passengerId] = passengerStates;
    } else {
      const firstPassengerStates = firstEnvironment.passengers[passengerId];

      firstPassengerStates.push(...passengerStates);
    }
  }

  for (const vehicleId in secondEnvironment.vehicles) {
    const vehicleStates = secondEnvironment.vehicles[vehicleId];

    if (firstEnvironment.vehicles[vehicleId] === undefined) {
      firstEnvironment.vehicles[vehicleId] = vehicleStates;
    } else {
      const firstVehicleStates = firstEnvironment.vehicles[vehicleId];

      firstVehicleStates.push(...vehicleStates);
    }
  }

  firstEnvironment.statistics.push(...secondEnvironment.statistics);

  return firstEnvironment;
}

// MARK: Performances
function findStopIndexBS(stops: Stop[], stop: Stop): number | null {
  const firstMatchingIndex = findFirstMatchingIndexBS(stops, (a) =>
    a.id.localeCompare(stop.id),
  );

  if (firstMatchingIndex === null) {
    return null; // Stop not found
  }

  let index = firstMatchingIndex;
  while (index < stops.length && stops[index].id === stop.id) {
    if (areStopsEqual(stops[index], stop)) {
      return index; // Found the index of the stop
    }

    index++;
  }

  return null; // Stop not found
}

function insertStopBS(stops: Stop[], stop: Stop): void {
  const index = findInsertionIndexBS(stops, (a) => a.id.localeCompare(stop.id));

  stops.splice(index, 0, stop);
}
/**
 *
 * @param array
 * @param compare Comparison function that returns:
 * - 0 if the elements are equal,
 * - a negative number if the compared element is less than the wanted element,
 * - a positive number if the compared element is greater than the wanted element.
 *
 * @param element
 * @returns
 */
function findFirstMatchingIndexBS<T>(
  array: T[],
  compare: (element: T) => number,
): number | null {
  let left = 0;
  let right = array.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compare(array[mid]);

    if (comparison === 0) {
      const beforeMid = mid - 1;
      if (beforeMid < 0 || compare(array[beforeMid]) !== 0) {
        return mid; // Found the first matching index
      }
      right = beforeMid; // Continue searching in the left half
    } else if (comparison < 0) {
      left = mid + 1; // Search in the right half
    } else {
      right = mid - 1; // Search in the left half
    }
  }

  return null; // No matching element found
}

/**
 * Finds the index where the element should be inserted to keep the array sorted.
 *
 * @param array
 * @param compare Comparison function that returns:
 * - a negative number if the compared element is less than the wanted element,
 * - a positive number if the compared element is greater than the wanted element.
 *
 * Zero will be treated as positive, meaning that the element will be inserted before the equal element.
 *
 * @returns The index where the element should be inserted.
 */
function findInsertionIndexBS<T>(
  array: T[],
  compare: (element: T) => number,
): number {
  let left = 0;
  let right = array.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compare(array[mid]);

    if (comparison < 0) {
      left = mid + 1; // Search in the right half
    } else {
      right = mid - 1; // Search in the left half
    }
  }

  return left;
}

// MARK: Display Utils
export function findClosestContinuousEnvironment(
  continuousEnvironments: ContinuousEnvironment[],
  timestamp: number,
): ContinuousEnvironment | null {
  if (timestamp === null) {
    return null;
  }

  if (continuousEnvironments.length === 0) {
    return null;
  }

  // TODO We need to use tasks or do this less frequently by storing the ones already done
  // We need to adjust the timestamps of environments in sequence
  for (let i = 0; i < continuousEnvironments.length - 1; i++) {
    const currentEnvironment = continuousEnvironments[i];
    const nextEnvironment = continuousEnvironments[i + 1];

    if (
      currentEnvironment.endUpdateIndex === nextEnvironment.startUpdateIndex
    ) {
      currentEnvironment.endTimestamp = nextEnvironment.startTimestamp;

      for (const passengerStates of Object.values(
        currentEnvironment.passengers,
      )) {
        const lastState = passengerStates[passengerStates.length - 1];
        if (lastState) {
          lastState.endTimestamp = nextEnvironment.startTimestamp;
        }
      }

      for (const vehicleStates of Object.values(currentEnvironment.vehicles)) {
        const lastState = vehicleStates[vehicleStates.length - 1];
        if (lastState) {
          lastState.endTimestamp = nextEnvironment.startTimestamp;
        }
      }

      const lastStatistics =
        currentEnvironment.statistics[currentEnvironment.statistics.length - 1];

      if (lastStatistics) {
        lastStatistics.endTimestamp = nextEnvironment.startTimestamp;
      }
    }
  }

  /**
   * In a sequence of following environments, the endTimestamp of the an environment always
   * matches the startTimestamp of the next environment.
   *
   * Thus, if the wanted timestamp is equal to the endTimestamp of an environment, we want
   * to try to find the next environment that starts at this time.
   *
   * It can happen that an entire state only contains updates at the same timestamp, so we
   * need to ensure that we have the freshest environment that contains the wanted timestamp.
   *
   * If it does not exist, we will allow the environment to be the one that ends at this time.
   *
   * If it does not exist either, then we don't have any environment that contains the wanted timestamp
   * and we return null.
   */

  // Environments are already sorted, so we can use binary search
  let index = findFirstMatchingIndexBS(
    continuousEnvironments,
    (comparedEnvironment) => {
      if (comparedEnvironment.startTimestamp > timestamp) {
        return 1; // comparedEnvironment is after wanted timestamp
      }
      if (comparedEnvironment.endTimestamp <= timestamp) {
        // take next environment if endTimestamp is equal to wanted timestamp
        return -1; // comparedEnvironment is before wanted timestamp
      }
      return 0; // comparedEnvironment contains wanted timestamp
    },
  );

  if (index !== null) {
    return continuousEnvironments[index];
  }

  // Try a second time with inclusive endTimestamp
  index = findFirstMatchingIndexBS(
    continuousEnvironments,
    (comparedEnvironment) => {
      if (comparedEnvironment.startTimestamp > timestamp) {
        return 1; // comparedEnvironment is after wanted timestamp
      }
      if (comparedEnvironment.endTimestamp < timestamp) {
        return -1; // comparedEnvironment is before wanted timestamp
      }
      return 0; // comparedEnvironment contains wanted timestamp
    },
  );

  if (index !== null) {
    return continuousEnvironments[index];
  }

  return null;
}

export function sliceEnvironment(
  continuousEnvironment: ContinuousEnvironment,
  timestamp: number,
): EnvironmentSlice {
  if (
    timestamp < continuousEnvironment.startTimestamp ||
    timestamp > continuousEnvironment.endTimestamp
  ) {
    console.error(continuousEnvironment);
    throw new Error(
      `Timestamp ${timestamp} is out of bounds for the continuous environment with start ${continuousEnvironment.startTimestamp} and end ${continuousEnvironment.endTimestamp}`,
    );
  }

  let updateIndex = continuousEnvironment.startUpdateIndex;

  // Passengers
  const passengers: Record<string, Passenger> = {};

  for (const [passengerId, passengerStates] of Object.entries(
    continuousEnvironment.passengers,
  )) {
    // Passengers are already sorted, so we can use binary search
    let closestPassengerIndex = findFirstMatchingIndexBS(
      passengerStates,
      (state) => {
        if (state.startTimestamp > timestamp) {
          return 1; // state is after wanted timestamp
        }
        if (state.endTimestamp <= timestamp) {
          return -1; // state is before wanted timestamp
        }
        return 0; // state contains wanted timestamp
      },
    );

    if (closestPassengerIndex === null) {
      // Following the same logic as in findClosestContinuousEnvironment,
      // we can try to find a state that ends at the wanted timestamp.
      closestPassengerIndex = findFirstMatchingIndexBS(
        passengerStates,
        (state) => {
          if (state.startTimestamp > timestamp) {
            return 1; // state is after wanted timestamp
          }
          if (state.endTimestamp < timestamp) {
            return -1; // state is before wanted timestamp
          }
          return 0; // state contains wanted timestamp
        },
      );

      if (closestPassengerIndex === null) {
        continue; // Passenger not present at this timestamp
      }
    }

    const closestPassengerState = passengerStates[closestPassengerIndex];

    if (closestPassengerState.updateIndex > updateIndex) {
      updateIndex = closestPassengerState.updateIndex;
    }

    passengers[passengerId] = closestPassengerState;
  }

  // Vehicles
  const vehicles: Record<string, Vehicle> = {};

  for (const [vehicleId, vehicleStates] of Object.entries(
    continuousEnvironment.vehicles,
  )) {
    // Vehicles are already sorted, so we can use binary search
    let closestVehicleIndex = findFirstMatchingIndexBS(
      vehicleStates,
      (state) => {
        if (state.startTimestamp > timestamp) {
          return 1; // state is after wanted timestamp
        }
        if (state.endTimestamp <= timestamp) {
          return -1; // state is before wanted timestamp
        }
        return 0; // state contains wanted timestamp
      },
    );

    if (closestVehicleIndex === null) {
      // Following the same logic as in findClosestContinuousEnvironment,
      // we can try to find a state that ends at the wanted timestamp.
      closestVehicleIndex = findFirstMatchingIndexBS(vehicleStates, (state) => {
        if (state.startTimestamp > timestamp) {
          return 1; // state is after wanted timestamp
        }
        if (state.endTimestamp < timestamp) {
          return -1; // state is before wanted timestamp
        }
        return 0; // state contains wanted timestamp
      });

      if (closestVehicleIndex === null) {
        continue; // Vehicle not present at this timestamp
      }
    }

    const closestVehicleState = vehicleStates[closestVehicleIndex];

    if (closestVehicleState.updateIndex > updateIndex) {
      updateIndex = closestVehicleState.updateIndex;
    }

    vehicles[vehicleId] = closestVehicleState;
  }

  // Statistics are already sorted, so we can use binary search
  const closestStatisticsIndex = findFirstMatchingIndexBS(
    continuousEnvironment.statistics,
    (state) => {
      if (state.startTimestamp > timestamp) {
        return 1; // state is after wanted timestamp
      }
      if (state.endTimestamp <= timestamp) {
        return -1; // state is before wanted timestamp
      }
      return 0; // state contains wanted timestamp
    },
  );

  if (closestStatisticsIndex === null) {
    console.error(continuousEnvironment);
    throw new Error(
      `No statistics found for timestamp ${timestamp} in the continuous environment`,
    );
  }

  const closestContinuousStatistics =
    continuousEnvironment.statistics[closestStatisticsIndex];

  if (closestContinuousStatistics.updateIndex > updateIndex) {
    updateIndex = closestContinuousStatistics.updateIndex;
  }

  const statistics = closestContinuousStatistics.statistics;

  // Stops
  const stops: Record<string, Stop> = {};

  for (const [_, vehicle] of Object.entries(vehicles)) {
    const vehicleStops = getAllStops(vehicle);

    for (const stop of vehicleStops) {
      stops[stop.id] = stop;
    }
  }

  return {
    passengers,
    vehicles,
    stops,
    statistics,
    timestamp,
    updateIndex,
  };
}
