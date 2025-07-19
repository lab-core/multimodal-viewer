import {
  extractSimulationEnvironment,
  SimulationEnvironment,
} from './environment.model';
import { CompositeTask, EXTRACT_STATE_TASK_PRIORITY, Task } from './task.model';
import { extractUpdate, Update } from './update.model';

export interface SimulationState extends SimulationEnvironment {
  updates: Update[];
}

export class ExtractStateTask extends CompositeTask {
  private environments: SimulationEnvironment[] = [];
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

class ExtractEnvironmentsTask extends CompositeTask {
  constructor(
    queue: Task[],
    private readonly serializedEnvironments: unknown,
    private readonly environments: SimulationEnvironment[],
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
    // TODO
  }
}

class ExtractEnvironmentTask extends Task {
  constructor(
    queue: Task[],
    private readonly serializedEnvironment: unknown,
    private readonly environments: SimulationEnvironment[],
  ) {
    super(EXTRACT_STATE_TASK_PRIORITY, queue);
  }

  public override process(): void {
    if (typeof this.serializedEnvironment !== 'string') {
      console.error(
        'Invalid data type for serialized environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }

    const parsedEnvironment: unknown = JSON.parse(this.serializedEnvironment);

    const environment = extractSimulationEnvironment(parsedEnvironment);

    if (environment === null) {
      console.error(
        'Invalid simulation environment',
        this.serializedEnvironment,
      );

      // TODO Failed
      return;
    }

    this.environments.push(environment);
  }
}

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
    // TODO
  }
}

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
    // TODO
  }
}

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
