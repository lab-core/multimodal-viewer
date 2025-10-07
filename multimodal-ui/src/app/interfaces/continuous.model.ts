import { SimulationEnvironment } from './environment.model';
import { Leg } from './leg.model';
import { getAllLegs, Passenger } from './passenger.model';
import { SortedList } from './performances.model';
import { SimulationState } from './state.model';
import { Statistics } from './statistics.model';
import { Stop } from './stop.model';
import { Tagged } from './tags.model';
import { AtomicTask, CompositeTask, Task } from './task.model';
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
  allPassengers: PassengerState[][]; // For faster loops
  vehicles: Record<string, VehicleState[]>;
  allVehicles: VehicleState[][]; // For faster loops
  statistics: StatisticsState[];
  startTimestamp: number;
  startUpdateIndex: number;
  endTimestamp: number;
  endUpdateIndex: number;
  isComplete: boolean;
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

  allVehicles: Vehicle[];
  allPassengers: Passenger[];
  allStops: Stop[];
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

// MARK: Tasks
export class BuildContinuousEnvironmentTask extends CompositeTask {
  private readonly continuousEnvironment: ContinuousEnvironment;

  constructor(
    queue: SortedList<Task>,
    private readonly state: SimulationState,
    private readonly references: ContinuousEnvironmentReferences,
    private readonly callback: (environment: ContinuousEnvironment) => void,
  ) {
    super(0, queue);

    this.continuousEnvironment = this.buildEmptyContinuousEnvironment();
  }

  protected override beforeAll(): void {
    for (const passenger of Object.values(this.state.passengers)) {
      new AtomicTask(0, this.subtasks, () =>
        updateContinuousPassenger(
          this.continuousEnvironment.passengers,
          this.continuousEnvironment.allPassengers,
          passenger,
          this.continuousEnvironment.startTimestamp,
          this.continuousEnvironment.endTimestamp,
          this.state.updateIndex,
          this.references,
        ),
      ).addToQueue();
    }

    for (const vehicle of Object.values(this.state.vehicles)) {
      new AtomicTask(0, this.subtasks, () =>
        updateContinuousVehicle(
          this.continuousEnvironment.vehicles,
          this.continuousEnvironment.allVehicles,
          vehicle,
          this.continuousEnvironment.startTimestamp,
          this.continuousEnvironment.endTimestamp,
          this.state.updateIndex,
          this.references,
        ),
      ).addToQueue();
    }

    new AtomicTask(0, this.subtasks, () =>
      updateContinuousStatistics(
        this.continuousEnvironment.statistics,
        this.state.statistics,
        this.continuousEnvironment.startTimestamp,
        this.continuousEnvironment.endTimestamp,
        this.state.updateIndex,
      ),
    ).addToQueue();

    const visitor = new UpdateVisitor(
      this.state,
      this.continuousEnvironment,
      this.references,
    );

    for (const update of this.state.updates) {
      new AtomicTask(-update.updateIndex - 1, this.subtasks, () => {
        visitor.visitUpdate(update);
      }).addToQueue();
    }
  }

  protected override afterAll(): void {
    this.callback(this.continuousEnvironment);
  }

  private buildEmptyContinuousEnvironment(): ContinuousEnvironment {
    const startTimestamp = this.state.timestamp;
    const startUpdateIndex = this.state.updateIndex;

    const updates = this.state.updates;
    const lastUpdate = updates[updates.length - 1];
    const endTimestamp = lastUpdate.timestamp;

    // We want the index of the next update, that will
    // match the end timestamp of the next environment if it exists.
    const endUpdateIndex = lastUpdate.updateIndex + 1;

    const isComplete = this.state.isComplete;

    return {
      passengers: {},
      allPassengers: [],
      vehicles: {},
      allVehicles: [],
      statistics: [],
      startTimestamp,
      startUpdateIndex,
      endTimestamp,
      endUpdateIndex,
      isComplete,
    };
  }
}

// MARK: Visitor
class UpdateVisitor implements UpdateVisitor {
  constructor(
    private readonly environment: SimulationEnvironment,
    private readonly continuousEnvironment: ContinuousEnvironment,
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
      this.continuousEnvironment.allPassengers,
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
      this.continuousEnvironment.allVehicles,
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
  allPassengers: PassengerState[][],
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
    allPassengers.push(passengerStates);
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
  allVehicles: VehicleState[][],
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
    allVehicles.push(vehicleStates);
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
export function updateContinuousEnvironmentsEndTimestamps(
  continuousEnvironments: ContinuousEnvironment[],
  alreadyUpdatedEnvironmentUpdateIndexes: number[],
): void {
  for (let i = 0; i < continuousEnvironments.length - 1; i++) {
    const currentEnvironment = continuousEnvironments[i];
    if (
      alreadyUpdatedEnvironmentUpdateIndexes.includes(
        currentEnvironment.endUpdateIndex,
      )
    ) {
      continue; // Already updated this environment
    }

    const nextEnvironment = continuousEnvironments[i + 1];

    if (
      currentEnvironment.endUpdateIndex === nextEnvironment.startUpdateIndex
    ) {
      currentEnvironment.endTimestamp = nextEnvironment.startTimestamp;

      // Faster for loop
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let j = 0; j < currentEnvironment.allPassengers.length; j++) {
        const passengerStates = currentEnvironment.allPassengers[j];
        const lastState = passengerStates[passengerStates.length - 1];
        if (lastState) {
          lastState.endTimestamp = nextEnvironment.startTimestamp;
        }
      }

      // Faster for loop
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let j = 0; j < currentEnvironment.allVehicles.length; j++) {
        const vehicleStates = currentEnvironment.allVehicles[j];
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

      alreadyUpdatedEnvironmentUpdateIndexes.push(
        currentEnvironment.endUpdateIndex,
      );
    }
  }
}

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
  const allPassengers: Passenger[] = [];

  // Faster for loop
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < continuousEnvironment.allPassengers.length; i++) {
    const passengerStates = continuousEnvironment.allPassengers[i];

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

    passengers[closestPassengerState.id] = closestPassengerState;
    allPassengers.push(closestPassengerState);
  }

  // Vehicles and stops
  const vehicles: Record<string, Vehicle> = {};
  const allVehicles: Vehicle[] = [];
  const stops: Record<string, Stop> = {};

  // Faster for loop
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < continuousEnvironment.allVehicles.length; i++) {
    const vehicleStates = continuousEnvironment.allVehicles[i];

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

    const vehicleStops = getAllStops(closestVehicleState);

    // Faster for loop
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let j = 0; j < vehicleStops.length; j++) {
      const stop = vehicleStops[j];
      stops[stop.id] = stop;
    }

    vehicles[closestVehicleState.id] = closestVehicleState;
    allVehicles.push(closestVehicleState);
  }

  // Statistics are already sorted, so we can use binary search
  let closestStatisticsIndex = findFirstMatchingIndexBS(
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
    // Following the same logic as in findClosestContinuousEnvironment,
    // we can try to find a state that ends at the wanted timestamp.
    closestStatisticsIndex = findFirstMatchingIndexBS(
      continuousEnvironment.statistics,
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

    if (closestStatisticsIndex === null) {
      console.error(continuousEnvironment);
      throw new Error(
        `No statistics found for timestamp ${timestamp} in the continuous environment`,
      );
    }
  }

  const closestContinuousStatistics =
    continuousEnvironment.statistics[closestStatisticsIndex];

  if (closestContinuousStatistics.updateIndex > updateIndex) {
    updateIndex = closestContinuousStatistics.updateIndex;
  }

  const statistics = closestContinuousStatistics.statistics;

  return {
    passengers,
    vehicles,
    stops,
    statistics,
    timestamp,
    updateIndex,
    allVehicles,
    allPassengers,
    allStops: Object.values(stops),
  };
}

export function getCoveredTimeIntervals(
  continuousEnvironments: ContinuousEnvironment[],
): { start: number; end: number }[] {
  if (continuousEnvironments.length === 0) {
    return [];
  }

  let currentInterval: { start: number; end: number } | null = null;

  const intervals: { start: number; end: number }[] = [];

  for (const environment of continuousEnvironments) {
    if (currentInterval === null) {
      currentInterval = {
        start: environment.startTimestamp,
        end: environment.endTimestamp,
      };
      continue;
    }

    if (environment.startTimestamp === currentInterval.end) {
      currentInterval.end = environment.endTimestamp;
    } else {
      intervals.push(currentInterval);

      currentInterval = {
        start: environment.startTimestamp,
        end: environment.endTimestamp,
      };
    }
  }

  if (currentInterval !== null) {
    intervals.push(currentInterval);
  }

  return intervals;
}

export function isIntervalCovered(
  continuousEnvironments: ContinuousEnvironment[],
  start: number,
  end: number,
): boolean {
  if (start >= end) {
    const temp = start;
    start = end;
    end = temp;
  }

  if (continuousEnvironments.length === 0) {
    return false;
  }

  const intervals = getCoveredTimeIntervals(continuousEnvironments);

  for (const interval of intervals) {
    if (interval.start <= start && interval.end >= end) {
      return true;
    }
  }

  return false;
}
