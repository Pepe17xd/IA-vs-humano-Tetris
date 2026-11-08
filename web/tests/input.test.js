import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchControls } from '../src/input.js';

function fakeTimers() {
  let nextId = 0;
  const jobs = new Map();
  return {
    jobs,
    schedule(callback, delay) { const id = ++nextId; jobs.set(id, { callback, delay }); return id; },
    unschedule(id) { jobs.delete(id); },
  };
}

function pointer(pointerId) { return { pointerId, prevented: false, preventDefault() { this.prevented = true; } }; }

test('touch repeat stops on pointer release and clears the held soft drop', () => {
  const timers = fakeTimers(), actions = [], releases = [];
  const controls = createTouchControls({ perform: command => actions.push(command), canPlay: () => true,
    onRelease: () => releases.push('released'), schedule: timers.schedule, unschedule: timers.unschedule });
  const down = pointer(7);
  assert.equal(controls.start(down, 'softDrop'), true);
  assert.equal(down.prevented, true);
  assert.deepEqual(actions, ['softDrop']);
  const repeat = [...timers.jobs.values()][0];
  assert.equal(repeat.delay, 75);
  repeat.callback();
  assert.deepEqual(actions, ['softDrop', 'softDrop']);
  controls.end(pointer(8));
  assert.equal(timers.jobs.size, 1, 'unrelated pointer release must not stop the active pointer');
  controls.end(pointer(7));
  assert.equal(timers.jobs.size, 0);
  assert.deepEqual(releases, ['released']);
  repeat.callback();
  assert.equal(actions.length, 2, 'released touch must not repeat');
});

test('touch controls reject new presses when paused and cancellation releases repeats', () => {
  const timers = fakeTimers(), actions = [], releases = [];
  let canPlay = false;
  const controls = createTouchControls({ perform: command => actions.push(command), canPlay: () => canPlay,
    onRelease: () => releases.push('released'), schedule: timers.schedule, unschedule: timers.unschedule });
  assert.equal(controls.start(pointer(1), 'left'), false);
  assert.equal(timers.jobs.size, 0);
  canPlay = true;
  assert.equal(controls.start(pointer(2), 'left'), true);
  controls.cancel();
  assert.equal(timers.jobs.size, 0);
  assert.deepEqual(releases, ['released']);
});

test('rotation and drop touch buttons fire once without repeat timers', () => {
  const timers = fakeTimers(), actions = [];
  const controls = createTouchControls({ perform: command => actions.push(command), canPlay: () => true,
    onRelease() {}, schedule: timers.schedule, unschedule: timers.unschedule });
  controls.start(pointer(3), 'rotateCW');
  controls.end(pointer(3));
  assert.deepEqual(actions, ['rotateCW']);
  assert.equal(timers.jobs.size, 0);
});
