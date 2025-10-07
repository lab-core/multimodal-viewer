import { Injectable } from '@angular/core';
import {
  BuildContinuousEnvironmentTask,
  ContinuousEnvironment,
  ContinuousEnvironmentReferences,
} from '../interfaces/continuous.model';
import { SortedList } from '../interfaces/performances.model';
import { ExtractStateTask, SimulationState } from '../interfaces/state.model';
import { emptyTaskQueue, Task } from '../interfaces/task.model';

@Injectable({
  providedIn: 'root',
})
/**
 * Service to manage a queue of Task instances.
 *
 * These tasks are run according to their priorities, and in parallel (single-threaded) if multiple tasks have the same priority.
 */
export class TaskService {
  private queue: SortedList<Task> = emptyTaskQueue();

  processTasks(processingEndTime: number): void {
    // Process at least one task
    this.processTask();

    while (this.queue.length > 0 && performance.now() < processingEndTime) {
      this.processTask();
    }
  }

  private processTask(): void {
    const task = this.queue.shift();

    if (!task) {
      return; // No tasks to process
    }

    task.process();
  }

  // MARK: Specific Tasks
  extractStateTask(
    serializedEnvironment: unknown,
    serializedUpdates: unknown,
    callback: (states: SimulationState | null) => void,
  ): ExtractStateTask {
    const task = new ExtractStateTask(
      this.queue,
      serializedEnvironment,
      serializedUpdates,
      callback,
    );

    task.addToQueue();

    return task;
  }

  buildContinuousEnvironmentTask(
    states: SimulationState,
    references: ContinuousEnvironmentReferences,
    callback: (environment: ContinuousEnvironment) => void,
  ): BuildContinuousEnvironmentTask {
    const task = new BuildContinuousEnvironmentTask(
      this.queue,
      states,
      references,
      callback,
    );

    task.addToQueue();

    return task;
  }

  // For debugging purposes
  get numberOfTasks(): number {
    return this.queue.items.reduce(
      (total, task) => total + task.numberOfTasks,
      0,
    );
  }
}
