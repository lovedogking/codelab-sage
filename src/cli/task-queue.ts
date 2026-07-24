export type TaskPriority = 'normal' | 'high';
export type TaskType = 'query' | 'plan' | 'explore' | 'search';

export interface QueuedTask {
  /** Unique task id. */
  id: string;
  /** Raw user input or command text. */
  text: string;
  /** High priority tasks are inserted at the front of the queue. */
  priority: TaskPriority;
  /** How the task should be executed. */
  type: TaskType;
  /** Timestamp when the task was created. */
  createdAt: number;
}

export interface TaskQueueStats {
  current?: QueuedTask;
  waiting: QueuedTask[];
  total: number;
  position: number;
}

/**
 * In-memory FIFO task queue with high-priority insertion.
 *
 * The queue only tracks waiting tasks. The currently executing task is stored
 * separately so the runner can cancel it independently.
 */
export class TaskQueue {
  private waiting: QueuedTask[] = [];
  private currentTask?: QueuedTask;

  /**
   * Add a task to the queue.
   * High priority tasks are inserted at the front; normal tasks at the back.
   */
  add(
    text: string,
    options: { priority?: TaskPriority; type?: TaskType } = {},
  ): QueuedTask {
    const task: QueuedTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      priority: options.priority ?? 'normal',
      type: options.type ?? 'query',
      createdAt: Date.now(),
    };

    if (task.priority === 'high') {
      this.waiting.unshift(task);
    } else {
      this.waiting.push(task);
    }

    return task;
  }

  /**
   * Get the next task to execute and mark it as current.
   * Returns undefined if the queue is empty or a task is already running.
   */
  startNext(): QueuedTask | undefined {
    if (this.currentTask || this.waiting.length === 0) {
      return undefined;
    }
    const task = this.waiting.shift();
    if (!task) {
      return undefined;
    }
    this.currentTask = task;
    return task;
  }

  /**
   * Mark the current task as finished.
   */
  finishCurrent(): void {
    this.currentTask = undefined;
  }

  /**
   * Cancel the current task. The runner is responsible for actually stopping
   * the work (e.g. via AbortSignal). This method only clears the current flag.
   */
  cancelCurrent(): boolean {
    if (!this.currentTask) {
      return false;
    }
    this.currentTask = undefined;
    return true;
  }

  /**
   * Remove all waiting tasks. The current task is not affected.
   */
  clear(): number {
    const count = this.waiting.length;
    this.waiting.length = 0;
    return count;
  }

  /**
   * List all waiting tasks (current task is not included).
   */
  list(): QueuedTask[] {
    return [...this.waiting];
  }

  /**
   * Get a snapshot of queue statistics for display.
   */
  stats(): TaskQueueStats {
    return {
      current: this.currentTask,
      waiting: [...this.waiting],
      total: this.waiting.length + (this.currentTask ? 1 : 0),
      position: this.currentTask ? 1 : 0,
    };
  }

  get current(): QueuedTask | undefined {
    return this.currentTask;
  }

  get size(): number {
    return this.waiting.length;
  }

  get isBusy(): boolean {
    return this.currentTask !== undefined;
  }

  get isEmpty(): boolean {
    return this.waiting.length === 0 && !this.currentTask;
  }
}
