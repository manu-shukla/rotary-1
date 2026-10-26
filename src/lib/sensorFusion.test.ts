/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAngle,
  calculateAngularDelta,
  calculateDetentTicks,
  applyRotaryDeltaToValue,
  evaluateSafeDialProgress,
  serializeNdefPayload,
  parseNdefPayload,
  generateNtag215Memory,
  formatHexDump,
  NtagDialState,
  SafeCombinationStep,
} from './sensorFusion';

test('normalizeAngle bounds angles properly in [0, 360)', () => {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(360), 0);
  assert.equal(normalizeAngle(720), 0);
  assert.equal(normalizeAngle(45), 45);
  assert.equal(normalizeAngle(-90), 270);
  assert.equal(normalizeAngle(-1), 359);
  assert.equal(normalizeAngle(400), 40);
});

test('calculateAngularDelta correctly handles circular wrap-around at 0/360 boundary', () => {
  // Turning CW from 358 to 5 degrees = +7 deg
  const cwWrap = calculateAngularDelta(5, 358);
  assert.equal(cwWrap, 7);

  // Turning CCW from 2 to 355 degrees = -7 deg
  const ccwWrap = calculateAngularDelta(355, 2);
  assert.equal(ccwWrap, -7);

  // Normal CW: 20 to 25 deg
  assert.equal(calculateAngularDelta(25, 20), 5);

  // Normal CCW: 50 to 42 deg
  assert.equal(calculateAngularDelta(42, 50), -8);

  // Exact 180 delta
  assert.equal(Math.abs(calculateAngularDelta(180, 0)), 180);
});

test('calculateDetentTicks produces crisp ticks and maintains accumulator remainder', () => {
  // 12 degrees accumulated with 5 degree detent step
  const res1 = calculateDetentTicks(12, 5);
  assert.equal(res1.ticks, 2);
  assert.equal(res1.remainingAccumulator, 2);
  assert.equal(res1.direction, 'cw');

  // Negative -14 degrees with 5 degree step
  const res2 = calculateDetentTicks(-14, 5);
  assert.equal(res2.ticks, 2);
  assert.equal(res2.remainingAccumulator, -4);
  assert.equal(res2.direction, 'ccw');

  // Sub-detent delta (< 5 deg)
  const res3 = calculateDetentTicks(4.2, 5);
  assert.equal(res3.ticks, 0);
  assert.equal(res3.remainingAccumulator, 4.2);
  assert.equal(res3.direction, null);
});

test('applyRotaryDeltaToValue respects min/max clamping or wrap-around', () => {
  // Volume: 50 + 2 ticks * 1 step = 52
  const vol = applyRotaryDeltaToValue(50, 2, 'cw', 1, 0, 100);
  assert.equal(vol, 52);

  // Clamping at maximum 100
  const maxClamped = applyRotaryDeltaToValue(98, 5, 'cw', 1, 0, 100);
  assert.equal(maxClamped, 100);

  // Clamping at minimum 0
  const minClamped = applyRotaryDeltaToValue(2, 5, 'ccw', 1, 0, 100);
  assert.equal(minClamped, 0);

  // Safe dial with wrap-around [0, 100)
  const safeDialWrapped = applyRotaryDeltaToValue(98, 4, 'cw', 1, 0, 100, true);
  assert.equal(safeDialWrapped, 2);
});

test('evaluateSafeDialProgress tracks directional safe tumbler steps', () => {
  const steps: SafeCombinationStep[] = [
    { target: 45, direction: 'cw', tolerance: 2 },
    { target: 18, direction: 'ccw', tolerance: 2 },
    { target: 72, direction: 'cw', tolerance: 2 },
  ];

  // At step 0, current dial 10, turn CW -> still step 0
  const s0 = evaluateSafeDialProgress(steps, 0, 10, 'cw');
  assert.equal(s0.unlocked, false);
  assert.equal(s0.currentStepIndex, 0);

  // Turn CW to 45 (within tolerance) -> triggers step 1!
  const s1 = evaluateSafeDialProgress(steps, 0, 45, 'cw');
  assert.equal(s1.currentStepIndex, 1);
  assert.equal(s1.unlocked, false);

  // Step 1: Turn CCW to 18 -> triggers step 2
  const s2 = evaluateSafeDialProgress(steps, 1, 18, 'ccw');
  assert.equal(s2.currentStepIndex, 2);
  assert.equal(s2.unlocked, false);

  // Step 2: Turn CW to 72 -> UNLOCKED!
  const s3 = evaluateSafeDialProgress(steps, 2, 72, 'cw');
  assert.equal(s3.currentStepIndex, 3);
  assert.equal(s3.unlocked, true);
});

test('serializeNdefPayload and parseNdefPayload correctly round-trip state', () => {
  const state: NtagDialState = {
    tagUid: '04:A2:3B:18:7F:50:80',
    name: 'Living Room Bulb',
    mode: 'light',
    value: 78,
    stepDeg: 5,
    minVal: 0,
    maxVal: 100,
    unit: '%',
    updatedAt: 1774880000000,
  };

  const payload = serializeNdefPayload(state);
  const parsed = parseNdefPayload(payload);

  assert.ok(parsed);
  assert.equal(parsed?.tagUid, state.tagUid);
  assert.equal(parsed?.mode, state.mode);
  assert.equal(parsed?.value, state.value);
  assert.equal(parsed?.unit, state.unit);
});

test('generateNtag215Memory produces 540-byte EEPROM structure with valid NXP header', () => {
  const state: NtagDialState = {
    tagUid: '04:A2:3B:18:7F:50:80',
    name: 'Volume Coaster',
    mode: 'volume',
    value: 42,
    stepDeg: 5,
    minVal: -80,
    maxVal: 12,
    unit: 'dB',
    updatedAt: 1774880000000,
  };

  const memory = generateNtag215Memory(state);
  assert.equal(memory.length, 540);
  assert.equal(memory[0], 0x04); // NXP manufacturer byte
  assert.equal(memory[12], 0xe1); // CC byte
  assert.equal(memory[16], 0x03); // NDEF TLV marker

  const dump = formatHexDump(memory, 0, 6);
  assert.equal(dump.length, 6);
  assert.equal(dump[0].label, 'UID 0-2 (NXP)');
  assert.equal(dump[3].label, 'Capability (CC)');
});
