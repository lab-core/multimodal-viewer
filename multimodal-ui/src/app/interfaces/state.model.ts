import { SimulationEnvironment } from './environment.model';
import { extractPassenger, Passenger } from './passenger.model';
import { isStatistics } from './statistics.model';
import { CompositeTask, EXTRACT_STATE_TASK_PRIORITY, Task } from './task.model';
import { extractUpdate, Update } from './update.model';
import { extractVehicle, Vehicle } from './vehicle.model';

// MARK: SimulationState
export interface SimulationState extends SimulationEnvironment {
  updates: Update[];

  /**
   * Indicates whether the state is complete, i.e., whether
   * any updates are missing between this state and the next one.
   */
  isComplete: boolean;
}

// MARK: Extract State
export class ExtractStateTask extends CompositeTask {
  private environments: (SimulationEnvironment &
    Pick<SimulationState, 'isComplete'>)[] = [];
  private updatesByFirstUpdateIndex: Record<number, Update[]> = {};

  constructor(
    queue: Task[],
    private readonly serializedEnvironments: unknown,
    private readonly serializedUpdates: unknown,
    private readonly callback: (states: SimulationState[] | null) => void,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue, []);
  }

  public override beforeAll(): void {
    new ExtractEnvironmentsTask(
      this.subtasks,
      this.serializedEnvironments,
      this.environments,
    ).addToQueue();

    new ExtractAllUpdatesTask(
      this.subtasks,
      this.serializedUpdates,
      this.updatesByFirstUpdateIndex,
    ).addToQueue();
  }

  public override afterAll(): void {
    const states: SimulationState[] = [];

    for (const environment of this.environments) {
      const updates = this.updatesByFirstUpdateIndex[environment.updateIndex];

      if (updates === undefined) {
        console.error(
          'No updates found for environment',
          environment,
          'in updates',
          this.updatesByFirstUpdateIndex,
          'from serialized updates',
          this.serializedUpdates,
          'and serialized environments',
          this.serializedEnvironments,
        );

        // TODO Failed
        this.callback(null);
        continue;
      }

      states.push({
        ...environment,
        updates,
      });
    }

    this.callback(states);
  }
}

// MARK: Extract Environments
class ExtractEnvironmentsTask extends CompositeTask {
  constructor(
    queue: Task[],
    private readonly serializedEnvironments: unknown,
    private readonly environments: (SimulationEnvironment &
      Pick<SimulationState, 'isComplete'>)[],
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue, []);
  }

  protected override beforeAll(): void {
    if (!Array.isArray(this.serializedEnvironments)) {
      console.error(
        'Invalid data type for serialized environments',
        this.serializedEnvironments,
      );

      // TODO Failed
      return;
    }

    for (const serializedEnvironment of this.serializedEnvironments) {
      new ExtractEnvironmentTask(
        this.subtasks,
        serializedEnvironment,
        this.environments,
      ).addToQueue();
    }
  }

  protected override afterAll(): void {
    // Nothing to do
  }
}

// MARK: Extract Environment
class ExtractEnvironmentTask extends CompositeTask {
  private environment: SimulationEnvironment &
    Pick<SimulationState, 'isComplete'> = {
    timestamp: -1,
    updateIndex: -1,
    statistics: {},
    passengers: {},
    vehicles: {},
    isComplete: false,
  };

  constructor(
    queue: Task[],
    private readonly serializedEnvironment: unknown,
    private readonly environments: (SimulationEnvironment &
      Pick<SimulationState, 'isComplete'>)[],
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue, []);
  }

  // TODO This slows down the FPS
  protected override beforeAll(): void {
    if (
      typeof this.serializedEnvironment !== 'object' ||
      this.serializedEnvironment === null
    ) {
      console.error(
        'Invalid data type for serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }

    if (
      !('timestamp' in this.serializedEnvironment) ||
      typeof this.serializedEnvironment.timestamp !== 'number'
    ) {
      console.error(
        'Invalid timestamp in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }
    this.environment.timestamp = this.serializedEnvironment.timestamp;

    if (
      !('updateIndex' in this.serializedEnvironment) ||
      typeof this.serializedEnvironment.updateIndex !== 'number'
    ) {
      console.error(
        'Invalid update index in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }
    this.environment.updateIndex = this.serializedEnvironment.updateIndex;

    if (
      !('isComplete' in this.serializedEnvironment) ||
      typeof this.serializedEnvironment.isComplete !== 'boolean'
    ) {
      console.error(
        'Invalid isComplete in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }
    this.environment.isComplete = this.serializedEnvironment.isComplete;

    if (
      !('statistics' in this.serializedEnvironment) ||
      typeof this.serializedEnvironment.statistics !== 'string'
    ) {
      console.error(
        'Invalid statistics in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }
    const statistics: unknown = JSON.parse(
      this.serializedEnvironment.statistics,
    );

    if (!isStatistics(statistics)) {
      console.error(
        'Invalid statistics object in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }
    this.environment.statistics = statistics;

    if (
      !('passengers' in this.serializedEnvironment) ||
      !Array.isArray(this.serializedEnvironment.passengers)
    ) {
      console.error(
        'Invalid passengers in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }

    for (const serializedPassenger of this.serializedEnvironment.passengers) {
      new ExtractPassengerTask(
        this.subtasks,
        serializedPassenger,
        this.environment.passengers,
      ).addToQueue();
    }

    if (
      !('vehicles' in this.serializedEnvironment) ||
      !Array.isArray(this.serializedEnvironment.vehicles)
    ) {
      console.error(
        'Invalid vehicles in serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }

    for (const serializedVehicle of this.serializedEnvironment.vehicles) {
      new ExtractVehicleTask(
        this.subtasks,
        serializedVehicle,
        this.environment.vehicles,
      ).addToQueue();
    }
  }

  protected override afterAll(): void {
    this.environments.push(this.environment);
  }
}

// MARK: Extract Passenger
class ExtractPassengerTask extends Task {
  constructor(
    queue: Task[],
    private readonly serializedPassenger: unknown,
    private readonly passengers: Record<string, Passenger>,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override process(): void {
    if (!(typeof this.serializedPassenger === 'string')) {
      console.error(
        'Invalid data type for serialized passenger',
        this.serializedPassenger,
      );

      // TODO Failed
      return;
    }

    const parsedPassenger: unknown = JSON.parse(this.serializedPassenger);

    const passenger = extractPassenger(parsedPassenger);

    if (passenger === null) {
      console.error('Invalid passenger', this.serializedPassenger);

      // TODO Failed
      return;
    }

    this.passengers[passenger.id] = passenger;
  }
}

// MARK: Extract Vehicle
class ExtractVehicleTask extends Task {
  constructor(
    queue: Task[],
    private readonly serializedVehicle: unknown,
    private readonly vehicles: Record<string, Vehicle>,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override process(): void {
    if (!(typeof this.serializedVehicle === 'string')) {
      console.error(
        'Invalid data type for serialized vehicle',
        this.serializedVehicle,
      );

      // TODO Failed
      return;
    }

    const parsedVehicle: unknown = JSON.parse(this.serializedVehicle);

    const vehicle = extractVehicle(parsedVehicle);

    if (vehicle === null) {
      console.error('Invalid vehicle', this.serializedVehicle);

      // TODO Failed
      return;
    }

    this.vehicles[vehicle.id] = vehicle;
  }
}

// MARK: Extract All Updates
class ExtractAllUpdatesTask extends CompositeTask {
  constructor(
    queue: Task[],
    private readonly serializedUpdates: unknown,
    private readonly updatesByFirstUpdateIndex: Record<number, Update[]>,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue, []);
  }

  protected override beforeAll(): void {
    if (
      typeof this.serializedUpdates !== 'object' ||
      this.serializedUpdates === null
    ) {
      console.error(
        'Invalid data type for serialized updates',
        this.serializedUpdates,
      );

      // TODO Failed
      return;
    }

    for (const [key, value] of Object.entries(this.serializedUpdates)) {
      new ExtractUpdatesTask(
        this.subtasks,
        key,
        value,
        this.updatesByFirstUpdateIndex,
      ).addToQueue();
    }
  }

  protected override afterAll(): void {
    // Nothing to do
  }
}

// MARK: Extract Updates
class ExtractUpdatesTask extends CompositeTask {
  private updates: Update[] = [];

  constructor(
    queue: Task[],
    private readonly serializedUpdatesKey: unknown,
    private readonly serializedUpdates: unknown,
    private readonly updatesByFirstUpdateIndex: Record<number, Update[]>,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue, []);
  }

  // TODO This slows down the FPS
  beforeAll(): void {
    if (typeof this.serializedUpdatesKey !== 'string') {
      console.error(
        'Invalid data type for key',
        this.serializedUpdatesKey,
        'with serialized updates',
        this.serializedUpdates,
      );

      // TODO Failed
      return;
    }

    const key = parseInt(this.serializedUpdatesKey);

    if (isNaN(key)) {
      console.error(
        'Key is not a valid number',
        this.serializedUpdatesKey,
        'with serialized updates',
        this.serializedUpdates,
      );

      // TODO Failed
      return;
    }

    if (!Array.isArray(this.serializedUpdates)) {
      console.error(
        'Invalid data type for serialized updates',
        this.serializedUpdates,
        'with key',
        this.serializedUpdatesKey,
      );

      // TODO Failed
      return;
    }

    this.updatesByFirstUpdateIndex[key] = this.updates;

    for (const serializedUpdate of this.serializedUpdates) {
      new ExtractUpdateTask(
        this.subtasks,
        serializedUpdate,
        this.updates,
      ).addToQueue();
    }
  }

  protected override afterAll(): void {
    // Nothing to do
  }
}

// MARK: Extract Update
class ExtractUpdateTask extends Task {
  constructor(
    queue: Task[],
    private readonly serializedUpdate: unknown,
    private readonly updates: Update[],
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override process(): void {
    if (typeof this.serializedUpdate !== 'string') {
      console.error(
        'Invalid data type for serialized update',
        this.serializedUpdate,
      );

      // TODO Failed
      return;
    }

    const update = extractUpdate(JSON.parse(this.serializedUpdate));

    if (update === null) {
      console.error('Invalid update', this.serializedUpdate);

      // TODO Failed
      return;
    }

    this.updates.push(update);
  }
}
