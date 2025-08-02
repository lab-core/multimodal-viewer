import { Injectable } from '@angular/core';
import {
  BuildContinuousEnvironmentsTask,
  ContinuousEnvironment,
  ContinuousEnvironmentReferences,
} from '../interfaces/continuous.model';
import { ExtractStateTask, SimulationState } from '../interfaces/state.model';
import { Task } from '../interfaces/task.model';

@Injectable({
  providedIn: 'root',
})
/**
 * Service to manage a queue of Task instances.
 *
 * These tasks are run according to their priorities, and in parallel (single-threaded) if multiple tasks have the same priority.
 */
export class TaskService {
  private queue: Task[] = [];

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
    serializedEnvironments: unknown,
    serializedUpdates: unknown,
    callback: (states: SimulationState[] | null) => void,
  ): void {
    new ExtractStateTask(
      this.queue,
      serializedEnvironments,
      serializedUpdates,
      callback,
    ).addToQueue();
  }

  buildContinuousEnvironmentsTask(
    states: SimulationState[],
    references: ContinuousEnvironmentReferences,
    callback: (environments: ContinuousEnvironment[]) => void,
  ) {
    new BuildContinuousEnvironmentsTask(
      this.queue,
      states,
      references,
      callback,
    ).addToQueue();
  }

  // For debugging purposes
  get numberOfTasks(): number {
    return this.queue.reduce((total, task) => total + task.numberOfTasks, 0);
  }
}
