/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DialMode = 'light' | 'volume' | 'video' | 'safe';

export interface NtagDialState {
  tagUid: string;
  name: string;
  mode: DialMode;
  value: number;
  stepDeg: number;
  minVal: number;
  maxVal: number;
  unit: string;
  updatedAt: number;
}

export interface DetentResult {
  ticks: number;
  remainingAccumulator: number;
  direction: 'cw' | 'ccw' | null;
}

export interface SafeCombinationStep {
  target: number;
  direction: 'cw' | 'ccw';
  tolerance: number;
}

export interface SafeDialStatus {
  currentStepIndex: number;
  totalSteps: number;
  unlocked: boolean;
  failed: boolean;
  message: string;
}

/**
 * Normalizes any angle in degrees into [0, 360)
 */
export function normalizeAngle(deg: number): number {
  const result = deg % 360;
  return result < 0 ? result + 360 : result;
}

/**
 * Calculates the shortest angular delta (in degrees) from prev to current.
 * Result is strictly between -180 and 180.
 * Positive = Clockwise, Negative = Counter-Clockwise.
 */
export function calculateAngularDelta(currentDeg: number, prevDeg: number): number {
  let diff = (currentDeg - prevDeg) % 360;
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }
  return diff;
}

/**
 * Given an accumulated angular delta and the detent step angle (e.g. 5°),
 * computes how many mechanical detent ticks occurred and keeps track of remainder.
 */
export function calculateDetentTicks(accumulatorDeg: number, detentStepDeg: number): DetentResult {
  if (detentStepDeg <= 0) {
    return { ticks: 0, remainingAccumulator: accumulatorDeg, direction: null };
  }

  const rawTicks = Math.trunc(accumulatorDeg / detentStepDeg);
  if (rawTicks === 0) {
    return { ticks: 0, remainingAccumulator: accumulatorDeg, direction: null };
  }

  const direction = rawTicks > 0 ? 'cw' : 'ccw';
  const remainingAccumulator = accumulatorDeg - rawTicks * detentStepDeg;

  return {
    ticks: Math.abs(rawTicks),
    remainingAccumulator,
    direction,
  };
}

/**
 * Applies rotary detent ticks to a target value within min/max bounds.
 */
export function applyRotaryDeltaToValue(
  currentValue: number,
  ticks: number,
  direction: 'cw' | 'ccw' | null,
  stepPerTick: number,
  minVal: number,
  maxVal: number,
  wrapAround: boolean = false
): number {
  if (!direction || ticks === 0) return currentValue;

  const sign = direction === 'cw' ? 1 : -1;
  const delta = sign * ticks * stepPerTick;
  let nextValue = currentValue + delta;

  if (wrapAround) {
    const span = maxVal - minVal;
    if (span <= 0) return minVal;
    while (nextValue < minVal) nextValue += span;
    while (nextValue > maxVal) nextValue -= span;
    return Math.round(nextValue * 1000) / 1000;
  }

  const clamped = Math.max(minVal, Math.min(maxVal, nextValue));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Validates safe combination dial movement
 */
export function evaluateSafeDialProgress(
  steps: SafeCombinationStep[],
  currentStepIndex: number,
  currentDialNumber: number, // 0 to 99
  direction: 'cw' | 'ccw' | null
): SafeDialStatus {
  if (currentStepIndex >= steps.length) {
    return {
      currentStepIndex,
      totalSteps: steps.length,
      unlocked: true,
      failed: false,
      message: 'Vault door unlocked! Locking mechanism released.',
    };
  }

  const step = steps[currentStepIndex];
  const diff = Math.abs(currentDialNumber - step.target);
  const circularDiff = Math.min(diff, 100 - diff);
  const isAtTarget = circularDiff <= step.tolerance;

  if (isAtTarget && direction === step.direction) {
    const nextIndex = currentStepIndex + 1;
    const isNowUnlocked = nextIndex >= steps.length;
    return {
      currentStepIndex: nextIndex,
      totalSteps: steps.length,
      unlocked: isNowUnlocked,
      failed: false,
      message: isNowUnlocked
        ? 'Vault door unlocked! Bolt pins retracted.'
        : `Tumbler ${currentStepIndex + 1} clicked! Reverse direction now.`,
    };
  }

  return {
    currentStepIndex,
    totalSteps: steps.length,
    unlocked: false,
    failed: false,
    message: `Step ${currentStepIndex + 1}: Turn ${step.direction.toUpperCase()} to ${step.target}`,
  };
}

/**
 * Serializes dial state to NDEF text/json payload
 */
export function serializeNdefPayload(state: NtagDialState): string {
  return JSON.stringify({
    app: 'tap-twist',
    v: 1,
    id: state.tagUid,
    name: state.name,
    mode: state.mode,
    val: state.value,
    step: state.stepDeg,
    min: state.minVal,
    max: state.maxVal,
    unit: state.unit,
    ts: state.updatedAt,
  });
}

/**
 * Parses NDEF payload into partial dial state
 */
export function parseNdefPayload(raw: string): Partial<NtagDialState> | null {
  try {
    const data = JSON.parse(raw);
    if (data.app !== 'tap-twist') return null;
    return {
      tagUid: data.id || 'NTAG215-SIM',
      name: data.name || 'Custom Rotary Tag',
      mode: (['light', 'volume', 'video', 'safe'].includes(data.mode) ? data.mode : 'volume') as DialMode,
      value: typeof data.val === 'number' ? data.val : 50,
      stepDeg: typeof data.step === 'number' ? data.step : 5,
      minVal: typeof data.min === 'number' ? data.min : 0,
      maxVal: typeof data.max === 'number' ? data.max : 100,
      unit: typeof data.unit === 'string' ? data.unit : '%',
      updatedAt: typeof data.ts === 'number' ? data.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Simulates raw NTAG215 EEPROM (504 bytes user memory + header pages, 540 bytes total).
 * NTAG215 has 135 pages of 4 bytes each (Pages 0x00 to 0x86).
 * Page 0-2: Serial Number (UID) and internal bytes
 * Page 3: Capability Container (CC)
 * Page 4+: User EEPROM memory (NDEF TLV record)
 */
export function generateNtag215Memory(state: NtagDialState): Uint8Array {
  const memory = new Uint8Array(540); // 135 pages * 4 bytes

  // Fake standard NXP UID: 04:xx:xx:xx:xx:xx:xx (7 bytes)
  const uidBytes = [0x04, 0xa2, 0x3b, 0x18, 0x7f, 0x50, 0x80];
  memory[0] = uidBytes[0];
  memory[1] = uidBytes[1];
  memory[2] = uidBytes[2];
  memory[3] = 0x88; // BCC0

  memory[4] = uidBytes[3];
  memory[5] = uidBytes[4];
  memory[6] = uidBytes[5];
  memory[7] = uidBytes[6]; // BCC1

  memory[8] = 0x48; // Internal
  memory[9] = 0x00; // Lock bytes
  memory[10] = 0x00;
  memory[11] = 0xe1; // CC magic byte

  // CC (Capability Container at Page 3)
  memory[12] = 0xe1;
  memory[13] = 0x10; // Version 1.0
  memory[14] = 0x6d; // Size: 109 * 8 = 872 bytes or standard NTAG215 (504 bytes user)
  memory[15] = 0x00; // Read/write access

  // Page 4: NDEF TLV header
  memory[16] = 0x03; // NDEF Message TLV tag
  const payloadString = serializeNdefPayload(state);
  const textBytes = new TextEncoder().encode(payloadString);
  const tlvLength = textBytes.length + 7; // header overhead

  memory[17] = tlvLength < 255 ? tlvLength : 0xff;

  // NDEF Record Header (Well-Known Text or Media record)
  memory[18] = 0xd1; // MB=1, ME=1, CF=0, SR=1, IL=0, TNF=0x01 (NFC Forum Well-known)
  memory[19] = 0x01; // Type Length (1 byte: 'T')
  memory[20] = textBytes.length + 3; // Payload Length (lang code + text)
  memory[21] = 0x54; // 'T' (Text record)
  memory[22] = 0x02; // Status byte: UTF-8, lang len = 2
  memory[23] = 0x65; // 'e'
  memory[24] = 0x6e; // 'n'

  // Copy payload text into memory
  for (let i = 0; i < textBytes.length; i++) {
    if (25 + i < memory.length - 1) {
      memory[25 + i] = textBytes[i];
    }
  }

  // Terminator TLV (0xFE)
  const termIndex = Math.min(memory.length - 1, 25 + textBytes.length);
  memory[termIndex] = 0xfe;

  return memory;
}

/**
 * Formats memory pages for the visual EEPROM hex viewer
 */
export function formatHexDump(memory: Uint8Array, startPage: number = 0, pageCount: number = 16): Array<{
  page: number;
  hex: string;
  ascii: string;
  label: string;
}> {
  const rows: Array<{ page: number; hex: string; ascii: string; label: string }> = [];

  for (let p = startPage; p < startPage + pageCount; p++) {
    const offset = p * 4;
    if (offset + 4 > memory.length) break;

    const slice = memory.slice(offset, offset + 4);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    let label = 'User Data';
    if (p === 0) label = 'UID 0-2 (NXP)';
    else if (p === 1) label = 'UID 3-6';
    else if (p === 2) label = 'Lock Bytes';
    else if (p === 3) label = 'Capability (CC)';
    else if (p === 4) label = 'NDEF Header';
    else if (p >= 5 && p < 12) label = 'NDEF Payload';
    else if (p >= 130) label = 'CFG / PWD';

    rows.push({ page: p, hex, ascii, label });
  }

  return rows;
}
