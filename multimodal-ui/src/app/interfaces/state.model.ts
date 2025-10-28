import { SimulationEnvironment } from './environment.model';
import { extractPassenger, Passenger } from './passenger.model';
import { SortedList } from './performances.model';
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

interface ExtractStateTaskState {
  environment:
    | (SimulationEnvironment & Pick<SimulationState, 'isComplete'>)
    | null;
  updates: Update[];
}

export class ExtractStateTask extends CompositeTask {
  private state: ExtractStateTaskState = {
    environment: null,
    updates: [],
  };

  constructor(
    queue: SortedList<Task>,
    private readonly serializedEnvironment: unknown,
    private readonly serializedUpdates: unknown,
    private readonly callback: (state: SimulationState | null) => void,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override beforeAll(): void {
    new ExtractEnvironmentTask(
      this.subtasks,
      this.serializedEnvironment,
      this.state,
    ).addToQueue();

    new ExtractUpdatesTask(
      this.subtasks,
      this.serializedUpdates,
      this.state,
    ).addToQueue();
  }

  public override afterAll(): void {
    this.callback(
      this.state.environment
        ? { ...this.state.environment, updates: this.state.updates }
        : null,
    );
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
    queue: SortedList<Task>,
    private readonly serializedEnvironment: unknown,
    private readonly state: ExtractStateTaskState,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  protected override beforeAll(): void {
    if (
      typeof this.serializedEnvironment !== 'object' ||
      this.serializedEnvironment === null
    ) {
      console.error(
        'Invalid data type for serialized environment',
        this.serializedEnvironment,
      );

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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

      // TODO #42 Failed
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
    this.state.environment = this.environment;
  }
}

// MARK: Extract Passenger
class ExtractPassengerTask extends Task {
  constructor(
    queue: SortedList<Task>,
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

      // TODO #42 Failed
      return;
    }

    const parsedPassenger: unknown = JSON.parse(this.serializedPassenger);

    const passenger = extractPassenger(parsedPassenger);

    if (passenger === null) {
      console.error('Invalid passenger', this.serializedPassenger);

      // TODO #42 Failed
      return;
    }

    this.passengers[passenger.id] = passenger;
  }
}

// MARK: Extract Vehicle
class ExtractVehicleTask extends Task {
  constructor(
    queue: SortedList<Task>,
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

      // TODO #42 Failed
      return;
    }

    const parsedVehicle: unknown = JSON.parse(this.serializedVehicle);

    const vehicle = extractVehicle(parsedVehicle);

    if (vehicle === null) {
      console.error('Invalid vehicle', this.serializedVehicle);

      // TODO #42 Failed
      return;
    }

    this.vehicles[vehicle.id] = vehicle;
  }
}

// MARK: Extract Updates
class ExtractUpdatesTask extends CompositeTask {
  private updates: SortedList<Update> = new SortedList<Update>(
    (a, b) => a.updateIndex - b.updateIndex,
  );

  constructor(
    queue: SortedList<Task>,
    private readonly serializedUpdates: unknown,
    private readonly state: ExtractStateTaskState,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  beforeAll(): void {
    if (!Array.isArray(this.serializedUpdates)) {
      console.error(
        'Invalid data type for serialized updates',
        this.serializedUpdates,
      );

      // TODO #42 Failed
      return;
    }

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
    this.state.updates = this.updates.editableItems;
  }
}

// MARK: Extract Update
class ExtractUpdateTask extends Task {
  constructor(
    queue: SortedList<Task>,
    private readonly serializedUpdate: unknown,
    private readonly updates: SortedList<Update>,
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override process(): void {
    if (typeof this.serializedUpdate !== 'string') {
      console.error(
        'Invalid data type for serialized update',
        this.serializedUpdate,
      );

      // TODO #42 Failed
      return;
    }

    const update = extractUpdate(JSON.parse(this.serializedUpdate));

    if (update === null) {
      console.error('Invalid update', this.serializedUpdate);

      // TODO #42 Failed
      return;
    }

    this.updates.add(update);
  }
}
