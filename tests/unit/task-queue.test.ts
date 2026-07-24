import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/cli/task-queue.js';

describe('TaskQueue', () => {
  it('adds normal tasks to the back', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.add('second');
    expect(queue.size).toBe(2);
    expect(queue.list().map((t) => t.text)).toEqual(['first', 'second']);
  });

  it('inserts high priority tasks at the front', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.add('second');
    queue.add('urgent', { priority: 'high' });
    expect(queue.list().map((t) => t.text)).toEqual(['urgent', 'first', 'second']);
  });

  it('processes tasks in FIFO order', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.add('second');

    const t1 = queue.startNext();
    expect(t1?.text).toBe('first');
    expect(queue.isBusy).toBe(true);

    queue.finishCurrent();
    expect(queue.isBusy).toBe(false);

    const t2 = queue.startNext();
    expect(t2?.text).toBe('second');
  });

  it('does not start a new task while one is running', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.add('second');
    const t1 = queue.startNext();
    expect(t1).toBeDefined();
    expect(queue.startNext()).toBeUndefined();
  });

  it('clears only waiting tasks', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.add('second');
    queue.startNext();
    const removed = queue.clear();
    expect(removed).toBe(1);
    expect(queue.size).toBe(0);
    expect(queue.current?.text).toBe('first');
  });

  it('cancels the current task', () => {
    const queue = new TaskQueue();
    queue.add('first');
    queue.startNext();
    expect(queue.cancelCurrent()).toBe(true);
    expect(queue.isBusy).toBe(false);
  });

  it('reports empty when no tasks', () => {
    const queue = new TaskQueue();
    expect(queue.isEmpty).toBe(true);
    queue.add('first');
    expect(queue.isEmpty).toBe(false);
  });
});
