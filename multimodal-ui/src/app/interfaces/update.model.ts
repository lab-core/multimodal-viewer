import getName from 'node-random-name';
import { SimulationEnvironment } from './environment.model';
import { extractLeg, isLegType, Leg } from './leg.model';
import { getAllLegs, isPassengerStatus, Passenger } from './passenger.model';
import { Position } from './position.model';
import { isStatistics, Statistics } from './statistics.model';
import { extractStop, isStopType, Stop } from './stop.model';
import { isTagged } from './tags.model';
import { getAllStops, isVehicleStatus, Vehicle } from './vehicle.model';

// MARK: UpdateType
export type UpdateType = 'passenger' | 'vehicle' | 'statistics';

export const UPDATE_TYPES: UpdateType[] = [
  'passenger',
  'vehicle',
  'statistics',
];

export function isUpdateType(value: unknown): value is UpdateType {
  return UPDATE_TYPES.includes(value as UpdateType);
}

// MARK: Update

export class Update {
  constructor(
    readonly updateType: UpdateType,
    readonly updateIndex: number,
    readonly eventIndex: number,
    readonly eventName: string,
    readonly timestamp: number,
  ) {}

  /**
   * Applies the update to the given simulation environment in place.
   *
   * This method should be implemented by subclasses.
   *
   * @param environment The environment in which the update is applied.
   */
  apply(environment: SimulationEnvironment): void {
    environment.updateIndex = this.updateIndex;
    environment.timestamp = this.timestamp;
  }

  /**
   * Accepts a visitor to perform operations on the update.
   *
   * This method should be implemented by subclasses.
   *
   * @param visitor The visitor that will process the update.
   */
  accept(visitor: UpdateVisitor): void {
    // This method should be overridden by subclasses.
  }

  static deserialize(serialized: unknown): Update | null {
    if (typeof serialized !== 'object' || !serialized) {
      console.error('Invalid data type for update', serialized);
      return null;
    }

    if (!('updateType' in serialized) || !isUpdateType(serialized.updateType)) {
      console.error('Invalid update type in serialized update', serialized);
      return null;
    }

    if (
      !('updateIndex' in serialized) ||
      typeof serialized.updateIndex !== 'number'
    ) {
      console.error('Invalid update index in serialized update', serialized);
      return null;
    }

    if (
      !('eventIndex' in serialized) ||
      typeof serialized.eventIndex !== 'number'
    ) {
      console.error('Invalid event index in serialized update', serialized);
      return null;
    }

    if (
      !('eventName' in serialized) ||
      typeof serialized.eventName !== 'string'
    ) {
      console.error('Invalid event name in serialized update', serialized);
      return null;
    }

    if (
      !('timestamp' in serialized) ||
      typeof serialized.timestamp !== 'number'
    ) {
      console.error('Invalid timestamp in serialized update', serialized);
      return null;
    }

    return new Update(
      serialized.updateType,
      serialized.updateIndex,
      serialized.eventIndex,
      serialized.eventName,
      serialized.timestamp,
    );
  }
}

// MARK: WithIndex
export type WithIndex<T> = T & {
  index: number;
};

// MARK: PassengerUpdate
export type PassengerDifferences = Partial<
  // Name is not included in the differences because it is overridden by the random name generator.
  Pick<Passenger, 'status' | 'numberOfPassengers' | 'tags'>
>;

export type LegDifferences = WithIndex<
  Partial<
    Pick<
      Leg,
      | 'tags'
      | 'legType'
      | 'assignedVehicleId'
      | 'boardingStopId'
      | 'alightingStopId'
      | 'boardingStopIndex'
      | 'alightingStopIndex'
      | 'boardingTime'
      | 'alightingTime'
    >
  >
>;

export class PassengerUpdate extends Update {
  private static readonly DEFAULT_DIFFERENCES: PassengerDifferences = {};
  private static readonly DEFAULT_LEGS_TO_ADD: Leg[] = [];
  private static readonly DEFAULT_LEGS_DIFFERENCES: WithIndex<LegDifferences>[] =
    [];
  private static readonly DEFAULT_NUMBER_OF_LEGS_TO_REMOVE = 0;

  constructor(
    updateIndex: number,
    eventIndex: number,
    eventName: string,
    timestamp: number,
    readonly passengerId: string,
    private readonly differences: PassengerDifferences,
    private readonly numberOfLegsToRemove: number,
    private readonly legsToAdd: Leg[],
    private readonly legsDifferences: WithIndex<LegDifferences>[],
  ) {
    super('passenger', updateIndex, eventIndex, eventName, timestamp);
  }

  override apply(environment: SimulationEnvironment): void {
    super.apply(environment);

    const status = this.differences.status;
    const numberOfPassengers = this.differences.numberOfPassengers;
    const tags = this.differences.tags;

    let passenger: Passenger = environment.passengers[this.passengerId];

    if (passenger === undefined) {
      if (status === undefined) {
        console.error(
          `Passenger with ID ${this.passengerId} does not exist and no status provided.`,
        );
        return;
      }
      if (numberOfPassengers === undefined) {
        console.error(
          `Passenger with ID ${this.passengerId} does not exist and no numberOfPassengers provided.`,
        );
        return;
      }
      if (tags === undefined) {
        console.error(
          `Passenger with ID ${this.passengerId} does not exist and no tags provided.`,
        );
        return;
      }

      passenger = {
        id: this.passengerId,
        entityType: 'passenger',
        name: getName({ seed: this.passengerId }),
        status,
        numberOfPassengers,
        tags,
        previousLegs: [],
        currentLeg: null,
        nextLegs: [],
        error: null, // Initially no error
        isFavorite: false, // Initially not favorite
      };
    } else {
      passenger = {
        ...passenger,
        ...this.differences,
      };
    }

    const allLegs = getAllLegs(passenger);

    if (this.numberOfLegsToRemove > 0) {
      allLegs.splice(
        allLegs.length - this.numberOfLegsToRemove,
        this.numberOfLegsToRemove,
      );
    }

    allLegs.push(...this.legsToAdd);

    for (const legDifferenceWithIndex of this.legsDifferences) {
      const { index, ...legDifference } = legDifferenceWithIndex;

      if (index < 0 || index >= allLegs.length) {
        console.error(
          `Invalid leg index ${index} for passenger ${this.passengerId}.`,
          this,
          environment,
        );
        continue;
      }

      allLegs[index] = {
        ...allLegs[index],
        ...legDifference,
      };
    }

    passenger.previousLegs = [];
    passenger.currentLeg = null;
    passenger.nextLegs = [];

    for (const leg of allLegs) {
      if (leg.legType === 'previous') {
        passenger.previousLegs.push(leg);
      } else if (leg.legType === 'current') {
        passenger.currentLeg = leg;
      } else if (leg.legType === 'next') {
        passenger.nextLegs.push(leg);
      }
    }

    environment.passengers[this.passengerId] = passenger;
  }

  override accept(visitor: UpdateVisitor): void {
    visitor.visitPassengerUpdate(this);
  }

  static override deserialize(serialized: unknown): PassengerUpdate | null {
    if (typeof serialized !== 'object' || serialized === null) {
      console.error('Invalid data type for passenger update', serialized);
      return null;
    }

    const baseUpdate = Update.deserialize(serialized);
    if (baseUpdate === null) {
      console.error(
        'Invalid base update in serialized passenger update',
        serialized,
      );
      return null;
    }

    if (
      !('passengerId' in serialized) ||
      typeof serialized.passengerId !== 'string'
    ) {
      console.error('Invalid passenger ID in serialized update', serialized);
      return null;
    }
    const passengerId = serialized.passengerId;

    let differences: PassengerUpdate['differences'] = this.DEFAULT_DIFFERENCES;
    if ('differences' in serialized) {
      if (!this.isPassengerDifferences(serialized.differences)) {
        console.error(
          'Invalid differences',
          serialized.differences,
          'in serialized passenger update',
          serialized,
        );
        return null;
      }

      differences = serialized.differences;
    }

    let numberOfLegsToRemove: PassengerUpdate['numberOfLegsToRemove'] =
      this.DEFAULT_NUMBER_OF_LEGS_TO_REMOVE;
    if ('numberOfLegsToRemove' in serialized) {
      if (typeof serialized.numberOfLegsToRemove !== 'number') {
        console.error(
          'Invalid number of legs to remove',
          serialized.numberOfLegsToRemove,
          'in serialized passenger update',
          serialized,
        );
        return null;
      }

      numberOfLegsToRemove = serialized.numberOfLegsToRemove;
    }

    let legsToAdd: PassengerUpdate['legsToAdd'] = this.DEFAULT_LEGS_TO_ADD;
    if ('legsToAdd' in serialized) {
      if (!Array.isArray(serialized.legsToAdd)) {
        console.error(
          'Invalid legs to add',
          serialized.legsToAdd,
          'in serialized passenger update',
          serialized,
        );
        return null;
      }

      const extractedLegsToAdd = serialized.legsToAdd.map(extractLeg);
      if (!extractedLegsToAdd.every((leg) => leg !== null)) {
        const firstInvalidLeg = extractedLegsToAdd.find((leg) => leg === null);
        console.error(
          'Invalid legs to add, including',
          firstInvalidLeg,
          'in serialized passenger update',
          serialized,
        );
        return null;
      }

      legsToAdd = extractedLegsToAdd;
    }

    let legsDifferences: PassengerUpdate['legsDifferences'] =
      this.DEFAULT_LEGS_DIFFERENCES;
    if ('legsDifferences' in serialized) {
      if (!this.isLegDifferencesArray(serialized.legsDifferences)) {
        console.error(
          'Invalid legs differences',
          serialized.legsDifferences,
          'in serialized passenger update',
          serialized,
        );
        return null;
      }

      legsDifferences = serialized.legsDifferences;
    }

    return new PassengerUpdate(
      baseUpdate.updateIndex,
      baseUpdate.eventIndex,
      baseUpdate.eventName,
      baseUpdate.timestamp,
      passengerId,
      differences,
      numberOfLegsToRemove,
      legsToAdd,
      legsDifferences,
    );
  }

  private static isPassengerDifferences(
    value: unknown,
  ): value is PassengerUpdate['differences'] {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('status' in value && !isPassengerStatus(value.status)) {
      return false;
    }

    if (
      'numberOfPassengers' in value &&
      typeof value.numberOfPassengers !== 'number'
    ) {
      return false;
    }

    if ('tags' in value) {
      if (!isTagged(value)) {
        return false;
      }

      value.tags = value.tags.sort((a, b) => a.localeCompare(b));
    }

    return true;
  }

  private static isLegDifferencesArray(
    value: unknown,
  ): value is PassengerUpdate['legsDifferences'] {
    return Array.isArray(value) && value.every(this.isLegDifferences);
  }

  private static isLegDifferences(
    this: void,
    value: unknown,
  ): value is PassengerUpdate['legsDifferences'][number] {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('index' in value && typeof value.index !== 'number') {
      return false;
    }

    if ('tags' in value) {
      if (!isTagged(value)) {
        return false;
      }

      value.tags = value.tags.sort((a, b) => a.localeCompare(b));
    }

    if ('legType' in value && !isLegType(value.legType)) {
      return false;
    }

    if (
      'assignedVehicleId' in value &&
      value.assignedVehicleId !== null &&
      typeof value.assignedVehicleId !== 'string'
    ) {
      return false;
    }

    if (
      'boardingStopId' in value &&
      value.boardingStopId !== null &&
      typeof value.boardingStopId !== 'string'
    ) {
      return false;
    }

    if (
      'alightingStopId' in value &&
      value.alightingStopId !== null &&
      typeof value.alightingStopId !== 'string'
    ) {
      return false;
    }

    if (
      'boardingStopIndex' in value &&
      value.boardingStopIndex !== null &&
      typeof value.boardingStopIndex !== 'number'
    ) {
      return false;
    }

    if (
      'alightingStopIndex' in value &&
      value.alightingStopIndex !== null &&
      typeof value.alightingStopIndex !== 'number'
    ) {
      return false;
    }

    if (
      'boardingTime' in value &&
      value.boardingTime !== null &&
      typeof value.boardingTime !== 'number'
    ) {
      return false;
    }

    if (
      'alightingTime' in value &&
      value.alightingTime !== null &&
      typeof value.alightingTime !== 'number'
    ) {
      return false;
    }

    return true;
  }
}

// MARK: VehicleUpdate
export type VehicleDifferences = Partial<
  Pick<Vehicle, 'mode' | 'status' | 'capacity' | 'name' | 'tags'>
>;

export type StopDifferences = WithIndex<
  Partial<
    Pick<
      Stop,
      | 'tags'
      | 'stopType'
      | 'arrivalTime'
      | 'departureTime'
      | 'capacity'
      | 'label'
    > &
      Position // latitude and longitude are in the stop object
  >
>;

export class VehicleUpdate extends Update {
  private static readonly DEFAULT_DIFFERENCES: VehicleDifferences = {};
  private static readonly DEFAULT_STOPS_TO_ADD: Stop[] = [];
  private static readonly DEFAULT_STOPS_DIFFERENCES: WithIndex<StopDifferences>[] =
    [];
  private static readonly DEFAULT_NUMBER_OF_STOPS_TO_REMOVE = 0;

  constructor(
    updateIndex: number,
    eventIndex: number,
    eventName: string,
    timestamp: number,
    readonly vehicleId: string,
    private readonly differences: VehicleDifferences,
    private readonly numberOfStopsToRemove: number,
    private readonly stopsToAdd: Stop[],
    private readonly stopsDifferences: WithIndex<StopDifferences>[],
  ) {
    super('vehicle', updateIndex, eventIndex, eventName, timestamp);
  }

  override apply(environment: SimulationEnvironment): void {
    super.apply(environment);

    const name = this.differences.name;
    const mode = this.differences.mode;
    const status = this.differences.status;
    const capacity = this.differences.capacity;
    const tags = this.differences.tags;

    let vehicle: Vehicle = environment.vehicles[this.vehicleId];

    if (vehicle === undefined) {
      if (name === undefined) {
        console.error(
          `Vehicle with ID ${this.vehicleId} does not exist and no name provided.`,
        );
        return;
      }
      if (mode === undefined) {
        console.error(
          `Vehicle with ID ${this.vehicleId} does not exist and no mode provided.`,
        );
        return;
      }
      if (status === undefined) {
        console.error(
          `Vehicle with ID ${this.vehicleId} does not exist and no status provided.`,
        );
        return;
      }
      if (capacity === undefined) {
        console.error(
          `Vehicle with ID ${this.vehicleId} does not exist and no capacity provided.`,
        );
        return;
      }
      if (tags === undefined) {
        console.error(
          `Vehicle with ID ${this.vehicleId} does not exist and no tags provided.`,
        );
        return;
      }

      vehicle = {
        id: this.vehicleId,
        entityType: 'vehicle',
        name,
        mode,
        status,
        capacity,
        tags,
        previousStops: [],
        currentStop: null,
        nextStops: [],
        error: null, // Initially no error
        isFavorite: false, // Initially not favorite
      };
    } else {
      vehicle = {
        ...vehicle,
        ...this.differences,
      };
    }

    const allStops = getAllStops(vehicle);

    if (this.numberOfStopsToRemove > 0) {
      allStops.splice(
        allStops.length - this.numberOfStopsToRemove,
        this.numberOfStopsToRemove,
      );
    }

    allStops.push(...this.stopsToAdd);

    for (const stopDifferenceWithIndex of this.stopsDifferences) {
      const { index, ...stopDifference } = stopDifferenceWithIndex;

      if (index < 0 || index >= allStops.length) {
        console.error(
          `Invalid stop index ${index} for vehicle ${this.vehicleId}.`,
          this,
          environment,
        );
        continue;
      }

      allStops[index] = {
        ...allStops[index],
        ...stopDifference,
      };
    }

    vehicle.previousStops = [];
    vehicle.currentStop = null;
    vehicle.nextStops = [];

    for (const stop of allStops) {
      if (stop.stopType === 'previous') {
        vehicle.previousStops.push(stop);
      } else if (stop.stopType === 'current') {
        vehicle.currentStop = stop;
      } else if (stop.stopType === 'next') {
        vehicle.nextStops.push(stop);
      }
    }

    environment.vehicles[this.vehicleId] = vehicle;
  }

  override accept(visitor: UpdateVisitor): void {
    visitor.visitVehicleUpdate(this);
  }

  static override deserialize(serialized: unknown): VehicleUpdate | null {
    if (typeof serialized !== 'object' || serialized === null) {
      console.error('Invalid data type for vehicle update', serialized);
      return null;
    }

    const baseUpdate = Update.deserialize(serialized);
    if (baseUpdate === null) {
      return null;
    }

    if (
      !('vehicleId' in serialized) ||
      typeof serialized.vehicleId !== 'string'
    ) {
      console.error('Invalid vehicle ID in serialized update', serialized);
      return null;
    }
    const vehicleId = serialized.vehicleId;

    let differences: VehicleUpdate['differences'] = this.DEFAULT_DIFFERENCES;
    if ('differences' in serialized) {
      if (!this.isVehicleDifferences(serialized.differences)) {
        console.error(
          'Invalid differences',
          serialized.differences,
          'in serialized vehicle update',
          serialized,
        );
        return null;
      }

      differences = serialized.differences;
    }

    let numberOfStopsToRemove: VehicleUpdate['numberOfStopsToRemove'] =
      this.DEFAULT_NUMBER_OF_STOPS_TO_REMOVE;
    if ('numberOfStopsToRemove' in serialized) {
      if (typeof serialized.numberOfStopsToRemove !== 'number') {
        console.error(
          'Invalid number of stops to remove',
          serialized.numberOfStopsToRemove,
          'in serialized vehicle update',
          serialized,
        );
        return null;
      }

      numberOfStopsToRemove = serialized.numberOfStopsToRemove;
    }

    let stopsToAdd: VehicleUpdate['stopsToAdd'] = this.DEFAULT_STOPS_TO_ADD;
    if ('stopsToAdd' in serialized) {
      if (!Array.isArray(serialized.stopsToAdd)) {
        console.error(
          'Invalid stops to add',
          serialized.stopsToAdd,
          'in serialized vehicle update',
          serialized,
        );
        return null;
      }

      const extractedStopsToAdd = serialized.stopsToAdd.map((stop) =>
        extractStop(stop, vehicleId),
      );
      if (!extractedStopsToAdd.every((stop) => stop !== null)) {
        const firstInvalidStop = extractedStopsToAdd.find(
          (stop) => stop === null,
        );
        console.error(
          'Invalid stops to add, including',
          firstInvalidStop,
          'in serialized vehicle update',
          serialized,
        );
        return null;
      }

      stopsToAdd = extractedStopsToAdd;
    }

    let stopsDifferences: VehicleUpdate['stopsDifferences'] =
      this.DEFAULT_STOPS_DIFFERENCES;
    if ('stopsDifferences' in serialized) {
      if (!this.isStopDifferencesArray(serialized.stopsDifferences)) {
        console.error(
          'Invalid stops differences',
          serialized.stopsDifferences,
          'in serialized vehicle update',
          serialized,
        );
        return null;
      }

      stopsDifferences = serialized.stopsDifferences;
    }

    return new VehicleUpdate(
      baseUpdate.updateIndex,
      baseUpdate.eventIndex,
      baseUpdate.eventName,
      baseUpdate.timestamp,
      vehicleId,
      differences,
      numberOfStopsToRemove,
      stopsToAdd,
      stopsDifferences,
    );
  }

  private static isVehicleDifferences(
    value: unknown,
  ): value is VehicleUpdate['differences'] {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('name' in value && typeof value.name !== 'string') {
      return false;
    }

    if (
      'mode' in value &&
      typeof value.mode !== 'string' &&
      value.mode !== null
    ) {
      return false;
    }

    if ('status' in value && !isVehicleStatus(value.status)) {
      return false;
    }

    if ('capacity' in value && typeof value.capacity !== 'number') {
      return false;
    }

    if ('tags' in value) {
      if (!isTagged(value)) {
        return false;
      }

      value.tags = value.tags.sort((a, b) => a.localeCompare(b));
    }

    return true;
  }

  private static isStopDifferencesArray(
    value: unknown,
  ): value is VehicleUpdate['stopsDifferences'] {
    return Array.isArray(value) && value.every(this.isStopDifferences);
  }

  private static isStopDifferences(
    this: void,
    value: unknown,
  ): value is VehicleUpdate['stopsDifferences'][number] {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('index' in value && typeof value.index !== 'number') {
      return false;
    }

    if ('tags' in value) {
      if (!isTagged(value)) {
        return false;
      }

      value.tags = value.tags.sort((a, b) => a.localeCompare(b));
    }

    if ('stopType' in value && !isStopType(value.stopType)) {
      return false;
    }

    if ('arrivalTime' in value && typeof value.arrivalTime !== 'number') {
      return false;
    }

    if (
      'departureTime' in value &&
      value.departureTime !== null &&
      typeof value.departureTime !== 'number'
    ) {
      return false;
    }

    if ('latitude' in value && typeof value.latitude !== 'number') {
      return false;
    }

    if ('longitude' in value && typeof value.longitude !== 'number') {
      return false;
    }

    if ('capacity' in value && typeof value.capacity !== 'number') {
      return false;
    }

    if ('label' in value && typeof value.label !== 'string') {
      return false;
    }

    return true;
  }
}

// MARK: StatisticsUpdate
export class StatisticsUpdate extends Update {
  readonly statistics: Readonly<Statistics>;

  constructor(
    updateIndex: number,
    eventIndex: number,
    eventName: string,
    timestamp: number,
    statistics: Statistics,
  ) {
    super('statistics', updateIndex, eventIndex, eventName, timestamp);

    this.statistics = Object.freeze(statistics);
  }

  override apply(environment: SimulationEnvironment): void {
    super.apply(environment);
    environment.statistics = this.statistics;
  }

  override accept(visitor: UpdateVisitor): void {
    visitor.visitStatisticsUpdate(this);
  }

  static override deserialize(serialized: unknown): StatisticsUpdate | null {
    if (typeof serialized !== 'object' || serialized === null) {
      console.error('Invalid data type for statistics update', serialized);
      return null;
    }

    const baseUpdate = Update.deserialize(serialized);
    if (baseUpdate === null) {
      return null;
    }

    if (!('statistics' in serialized) || !isStatistics(serialized.statistics)) {
      console.error('Invalid statistics in serialized update', serialized);
      return null;
    }
    const statistics = serialized.statistics;

    return new StatisticsUpdate(
      baseUpdate.updateIndex,
      baseUpdate.eventIndex,
      baseUpdate.eventName,
      baseUpdate.timestamp,
      statistics,
    );
  }
}

// MARK: extractUpdate
export function extractUpdate(data: unknown): Update | null {
  if (typeof data !== 'object' || data === null) {
    console.error('Invalid data type for update', data);
    return null;
  }

  if (!('updateType' in data) || !isUpdateType(data.updateType)) {
    console.error('Invalid update type in data', data);
    return null;
  }

  switch (data.updateType) {
    case 'passenger':
      return PassengerUpdate.deserialize(data);
    case 'vehicle':
      return VehicleUpdate.deserialize(data);
    case 'statistics':
      return StatisticsUpdate.deserialize(data);
  }
}

// MARK: UpdateVisitor

export interface UpdateVisitor {
  visitPassengerUpdate(update: PassengerUpdate): void;

  visitVehicleUpdate(update: VehicleUpdate): void;

  visitStatisticsUpdate(update: StatisticsUpdate): void;
}
