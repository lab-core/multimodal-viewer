import { TestBed } from '@angular/core/testing';
import { SortedList } from '../interfaces/performances.model';
import {
  AtomicTask,
  emptyTaskQueue,
  EXTRACT_STATE_TASK_PRIORITY,
  Task,
} from '../interfaces/task.model';
import { CommunicationService } from './communication.service';
import { DataService } from './data.service';
import { SimulationService, StateExtractionTask } from './simulation.service';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

function createTestTask(queue: SortedList<Task>, priority = 0): Task {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return new AtomicTask(priority, queue, () => {}).addToQueue();
}

describe('SimulationService', () => {
  let service: SimulationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataService, useValue: {} },
        { provide: CommunicationService, useValue: {} },
        { provide: TaskService, useValue: {} },
        { provide: TimerService, useValue: {} },
      ],
    });

    service = TestBed.inject(SimulationService);
  });

  describe('updateTasksPriority', () => {
    let wantedVisualizationTime: number;

    let taskAfter1: StateExtractionTask;
    let taskAfter2: StateExtractionTask;

    let taskBefore1: StateExtractionTask;
    let taskBefore2: StateExtractionTask;

    let taskEqual1: StateExtractionTask;
    let taskEqual2: StateExtractionTask;

    let queue: SortedList<Task>;

    beforeEach(() => {
      wantedVisualizationTime = 50;

      queue = emptyTaskQueue();

      taskBefore1 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime - 2,
        startUpdateIndex: 0,
      };
      taskBefore2 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime - 1,
        startUpdateIndex: 1,
      };

      taskEqual1 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime,
        startUpdateIndex: 2,
      };
      taskEqual2 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime,
        startUpdateIndex: 3,
      };

      taskAfter1 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime + 1,
        startUpdateIndex: 4,
      };
      taskAfter2 = {
        task: createTestTask(queue, EXTRACT_STATE_TASK_PRIORITY),
        startTimestamp: wantedVisualizationTime + 2,
        startUpdateIndex: 5,
      };
    });

    describe('when all tasks are after the wanted visualization time', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(1, taskAfter1);
        service['stateExtractionTasks'].set(2, taskAfter2);
      });

      it('should make the closest task the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskAfter1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
        expect(taskAfter2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
      });
    });

    describe('when all tasks are before the wanted visualization time', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(2, taskBefore1);
        service['stateExtractionTasks'].set(1, taskBefore2);
      });

      it('should make the closest task the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskBefore1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskBefore2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
      });
    });

    describe('when there are tasks before and after the wanted visualization time and the closest task is the one after', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(1, taskBefore1);
        service['stateExtractionTasks'].set(2, taskAfter1);
      });

      it('should make the task before the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskBefore1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
        expect(taskAfter1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
      });
    });

    describe('when there are tasks before and after the wanted visualization time', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(2, taskBefore1);
        service['stateExtractionTasks'].set(1, taskBefore2);
        service['stateExtractionTasks'].set(3, taskAfter1);
        service['stateExtractionTasks'].set(4, taskAfter2);
      });

      it('should make the closest task before the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskBefore1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskBefore2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
        expect(taskAfter1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskAfter2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
      });
    });

    describe('when there are tasks with the same start time as the wanted visualization time', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(1, taskEqual1);
        service['stateExtractionTasks'].set(2, taskEqual2);
      });

      it('should make the task with the greatest update index the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskEqual1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskEqual2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
      });
    });

    describe('when there are tasks before, after and at the wanted visualization time', () => {
      beforeEach(() => {
        service['stateExtractionTasks'].set(2, taskBefore1);
        service['stateExtractionTasks'].set(1, taskBefore2);
        service['stateExtractionTasks'].set(1, taskEqual1);
        service['stateExtractionTasks'].set(2, taskEqual2);
        service['stateExtractionTasks'].set(3, taskAfter1);
        service['stateExtractionTasks'].set(4, taskAfter2);
      });

      it('should make the task at the wanted visualization time with the greatest update index the most urgent', () => {
        service['updateTasksPriority'](wantedVisualizationTime);

        expect(taskBefore1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskBefore2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskEqual1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskEqual2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY + 1);
        expect(taskAfter1.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
        expect(taskAfter2.task.priority).toBe(EXTRACT_STATE_TASK_PRIORITY);
      });
    });
  });
});
