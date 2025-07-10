import { extractLeg, isLegType, Leg } from './leg.model';
import {
  getAllLegs,
  isPassengerStatus,
  Passenger,
  SimulationEnvironment,
} from './simulation.model';
import { isTagged } from './tags.model';
export type UpdateType = 'passenger' | 'vehicle' | 'statistics';
export const UPDATE_TYPES: UpdateType[] = [
  'passenger',
  'vehicle',
  'statistics',
];

export function isUpdateType(value: unknown): value is UpdateType {
  return UPDATE_TYPES.includes(value as UpdateType);
}

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
    // This method should be implemented by subclasses.
  }

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static deserialize(serialized: any): Update | null {
    if (typeof serialized !== 'object' || !serialized) {
      console.error('Invalid serialized update:', serialized);
      return null;
    }

    const updateType: unknown = serialized['updateType'];
    if (!isUpdateType(updateType)) {
      console.error('Unknown update type:', updateType);
      return null;
    }

    const updateIndex: unknown = serialized['updateIndex'];
    if (typeof updateIndex !== 'number') {
      console.error('Invalid update index:', updateIndex);
      return null;
    }

    const eventIndex: unknown = serialized['eventIndex'];
    if (typeof eventIndex !== 'number') {
      console.error('Invalid event index:', eventIndex);
      return null;
    }

    const eventName: unknown = serialized['eventName'];
    if (typeof eventName !== 'string') {
      console.error('Invalid event name:', eventName);
      return null;
    }

    const timestamp: unknown = serialized['timestamp'];
    if (typeof timestamp !== 'number') {
      console.error('Invalid timestamp:', timestamp);
      return null;
    }

    return new Update(
      updateType,
      updateIndex,
      eventIndex,
      eventName,
      timestamp,
    );
  }
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

export type PassengerDifferences = Partial<
  Pick<Passenger, 'name' | 'status' | 'numberOfPassengers' | 'tags'>
>;

export type WithIndex<T> = T & {
  index: number;
};

export type LegDifferences = { index: number } & Partial<Leg>;

export class PassengerUpdate extends Update {
  constructor(
    updateIndex: number,
    eventIndex: number,
    eventName: string,
    timestamp: number,
    private readonly passengerId: string,
    private readonly differences: PassengerDifferences = {},
    private readonly numberOfLegsToRemove = 0,
    private readonly legsToAdd: Leg[] = [],
    private readonly legsDifferences: WithIndex<LegDifferences>[] = [],
  ) {
    super('passenger', updateIndex, eventIndex, eventName, timestamp);
  }

  override apply(environment: SimulationEnvironment): void {
    const name = this.differences.name;
    const status = this.differences.status;
    const numberOfPassengers = this.differences.numberOfPassengers;
    const tags = this.differences.tags;

    let passenger: Passenger = environment.passengers[this.passengerId];

    if (passenger === undefined) {
      if (name === undefined) {
        console.error(
          `Passenger with ID ${this.passengerId} does not exist and no name provided.`,
        );
        return;
      }
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
        name,
        status,
        numberOfPassengers,
        tags,
        previousLegs: [],
        currentLeg: null,
        nextLegs: [],
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

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static override deserialize(serialized: any): PassengerUpdate | null {
    const baseUpdate = Update.deserialize(serialized);
    if (baseUpdate === null) {
      return null;
    }

    const passengerId: unknown = serialized['passengerId'];
    if (typeof passengerId !== 'string') {
      console.error('Invalid passenger ID:', passengerId);
      return null;
    }

    const differences: unknown = serialized['differences'] ?? {};
    if (!this.isPassengerDifferences(differences)) {
      console.error('Invalid differences:', differences);
      return null;
    }

    const numberOfLegsToRemove: unknown =
      serialized['numberOfLegsToRemove'] ?? 0;
    if (typeof numberOfLegsToRemove !== 'number') {
      console.error('Invalid number of legs to remove:', numberOfLegsToRemove);
      return null;
    }

    const legsToAdd: unknown = serialized['legsToAdd'] ?? [];
    if (!this.isLegArray(legsToAdd)) {
      console.error('Invalid legs to add:', legsToAdd);
      return null;
    }

    const legsDifferences: unknown = serialized['legsDifferences'] ?? [];
    if (!this.isLegDifferencesArray(legsDifferences)) {
      console.error('Invalid legs differences:', legsDifferences);
      return null;
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
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */

  private static isPassengerDifferences(
    value: unknown,
  ): value is PassengerDifferences {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('name' in value && typeof value.name !== 'string') {
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
    if ('tags' in value && !isTagged(value)) {
      return false;
    }
    return true;
  }

  private static isLegArray(value: unknown): value is Leg[] {
    if (!Array.isArray(value)) {
      return false;
    }

    // Extract each element in place
    for (let index = 0; index < value.length; index++) {
      const leg = extractLeg(value[index]);
      if (leg === null) {
        console.error(`Invalid leg at index ${index}:`, value[index]);
        return false;
      }
      value[index] = leg; // Replace the element with the extracted leg
    }

    return true;
  }

  private static isLegDifferencesArray(
    value: unknown,
  ): value is WithIndex<LegDifferences>[] {
    return Array.isArray(value) && value.every(this.isLegDifferences);
  }

  private static isLegDifferences(
    this: void,
    value: unknown,
  ): value is WithIndex<LegDifferences> {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if ('tags' in value && !isTagged(value)) {
      return false;
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
