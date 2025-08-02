export const EXTRACT_STATE_TASK_PRIORITY = 1;
export const BUILD_CONTINUOUS_ENVIRONMENT_TASK_PRIORITY = 2;

/**
 * This class represents a task that can be added to a queue and processed based on its priority.
 *
 * Tasks should be quick to process.
 */
export abstract class Task {
  constructor(
    public readonly priority: number,
    protected readonly queue: Task[],
  ) {}

  public addToQueue(): void {
    this.queue.push(this);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * This method is called to process the task.
   *
   * It should be implemented by subclasses to define the task's behavior.
   */
  public abstract process(): void;

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  public get numberOfTasks(): number {
    return 1;
  }
}

/**
 * This class represents a simple task that is built from a function.
 */
export class AtomicTask extends Task {
  constructor(
    priority: number,
    queue: Task[],
    private readonly taskFunction: () => void,
  ) {
    super(priority, queue);
  }

  /**
   * This method is called to process the task.
   */
  public override process(): void {
    this.taskFunction();
  }
}

/**
 * This class represents a task that contains multiple subtasks that can be processed in parallel.
 */
export abstract class CompositeTask extends Task {
  private hasCalledBeforeAll = false;

  constructor(
    priority: number,
    queue: Task[],
    /**
     * The subtasks to be processed in parallel.
     *
     * This array acts as a queue for subtasks. This array should be used when instantiating the subtasks.
     */
    protected readonly subtasks: Task[],
  ) {
    super(priority, queue);
  }

  public override process(): void {
    if (!this.hasCalledBeforeAll) {
      this.beforeAll();
      this.hasCalledBeforeAll = true;
    } else {
      const subtask = this.subtasks.shift();

      if (!subtask) {
        this.afterAll();
        return; // All subtasks completed
      }

      subtask.process();
    }

    this.addToQueue();
  }

  /**
   * This method is called before all subtasks are processed.
   *
   * It should be implemented by subclasses to define the behavior before processing subtasks.
   */
  protected abstract beforeAll(): void;

  /**
   * This method is called when all subtasks are completed.
   *
   * It should be implemented by subclasses to define the completion behavior.
   */
  protected abstract afterAll(): void;

  public override get numberOfTasks(): number {
    return this.subtasks.reduce((total, task) => total + task.numberOfTasks, 1);
  }
}
