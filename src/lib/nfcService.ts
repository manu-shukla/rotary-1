/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NtagDialState, DialMode, serializeNdefPayload, parseNdefPayload } from './sensorFusion';

export interface PredefinedTag {
  id: string;
  name: string;
  placement: string;
  mode: DialMode;
  initialValue: number;
  minVal: number;
  maxVal: number;
  stepDeg: number;
  unit: string;
  tagUid: string;
  description: string;
}

export const PREDEFINED_TAGS: PredefinedTag[] = [
  {
    id: 'tag-lamp',
    name: 'Smart Ambient Lumens & Temp',
    placement: 'Embedded in Walnut Desk Coaster',
    mode: 'light',
    initialValue: 70,
    minVal: 0,
    maxVal: 100,
    stepDeg: 5,
    unit: '%',
    tagUid: '04:A2:3B:18:7F:50:80',
    description: 'Twist clockwise to increase room brightness and shift from candle amber to daylight',
  },
  {
    id: 'tag-volume',
    name: 'Hi-Fi Stereo Master Volume',
    placement: 'Machined Aluminum Coaster on Speaker',
    mode: 'volume',
    initialValue: 46,
    minVal: 0,
    maxVal: 100,
    stepDeg: 5,
    unit: '%',
    tagUid: '04:8E:44:92:1A:30:80',
    description: 'Crisp mechanical detents every 5° driving analog-grade VU meters and decibel scale',
  },
  {
    id: 'tag-video',
    name: 'Cinema Jog & Shuttle Wheel',
    placement: 'Editing Suite Desk Pad',
    mode: 'video',
    initialValue: 142,
    minVal: 0,
    maxVal: 900,
    stepDeg: 5,
    unit: ' frames',
    tagUid: '04:5F:C1:2B:6D:88:80',
    description: 'Sub-frame precision video scrubbing with SMPTE timecode (HH:MM:SS:FF)',
  },
  {
    id: 'tag-safe',
    name: 'Heavy Bank Vault Safe Dial',
    placement: 'Cast Iron Vault Door Faceplate',
    mode: 'safe',
    initialValue: 0,
    minVal: 0,
    maxVal: 100,
    stepDeg: 5,
    unit: '',
    tagUid: '04:19:90:3F:82:11:80',
    description: 'Three-stage combination safe dial (CW to 45 → CCW to 18 → CW to 72) with tumbler clicks',
  },
];

export class NfcService {
  private isWebNfcAvailable: boolean = false;
  private ndefReader: any = null;
  private isScanning: boolean = false;
  private activeTagState: NtagDialState;
  private storageKeyPrefix = 'tap_twist_tag_';

  constructor() {
    this.isWebNfcAvailable = typeof window !== 'undefined' && 'NDEFReader' in window;
    // Default to Lamp
    this.activeTagState = this.loadTagState(PREDEFINED_TAGS[0]);
  }

  public isSupported(): boolean {
    return this.isWebNfcAvailable;
  }

  public getActiveTag(): NtagDialState {
    return { ...this.activeTagState };
  }

  public setActiveTag(tag: PredefinedTag): NtagDialState {
    this.activeTagState = this.loadTagState(tag);
    return { ...this.activeTagState };
  }

  public updateActiveTagValue(val: number): NtagDialState {
    this.activeTagState.value = val;
    this.activeTagState.updatedAt = Date.now();
    return { ...this.activeTagState };
  }

  public saveActiveTagState() {
    if (typeof localStorage !== 'undefined') {
      try {
        const key = `${this.storageKeyPrefix}${this.activeTagState.tagUid}`;
        localStorage.setItem(key, JSON.stringify(this.activeTagState));
      } catch {}
    }
  }

  public loadTagState(preset: PredefinedTag): NtagDialState {
    if (typeof localStorage !== 'undefined') {
      try {
        const key = `${this.storageKeyPrefix}${preset.tagUid}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          return {
            tagUid: preset.tagUid,
            name: preset.name,
            mode: preset.mode,
            value: typeof parsed.value === 'number' ? parsed.value : preset.initialValue,
            stepDeg: preset.stepDeg,
            minVal: preset.minVal,
            maxVal: preset.maxVal,
            unit: preset.unit,
            updatedAt: parsed.updatedAt || Date.now(),
          };
        }
      } catch {}
    }

    return {
      tagUid: preset.tagUid,
      name: preset.name,
      mode: preset.mode,
      value: preset.initialValue,
      stepDeg: preset.stepDeg,
      minVal: preset.minVal,
      maxVal: preset.maxVal,
      unit: preset.unit,
      updatedAt: Date.now(),
    };
  }

  /**
   * Starts genuine Web NFC scanning on Android Chrome / supported hardware
   */
  public async startRealNfcScan(onTagRead: (state: NtagDialState) => void, onError: (err: string) => void): Promise<boolean> {
    if (!this.isWebNfcAvailable) {
      onError('Web NFC is not supported in this browser. Running high-precision sensor simulation.');
      return false;
    }

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      this.ndefReader = new NDEFReaderClass();
      await this.ndefReader.scan();
      this.isScanning = true;

      this.ndefReader.addEventListener('reading', ({ message, serialNumber }: any) => {
        let parsedState: Partial<NtagDialState> | null = null;
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding || 'utf-8');
            const text = textDecoder.decode(record.data);
            parsedState = parseNdefPayload(text);
            if (parsedState) break;
          }
        }

        if (parsedState) {
          this.activeTagState = {
            ...this.activeTagState,
            ...parsedState,
            tagUid: serialNumber || this.activeTagState.tagUid,
          };
        } else {
          this.activeTagState.tagUid = serialNumber || this.activeTagState.tagUid;
        }

        onTagRead({ ...this.activeTagState });
      });

      this.ndefReader.addEventListener('readingerror', () => {
        onError('NFC presence glitch or read error. Ensure phone is held flat against tag.');
      });

      return true;
    } catch (err: any) {
      onError(err?.message || 'Could not start NFC scanner');
      return false;
    }
  }

  /**
   * Writes the dial state directly to a physical NTAG215 tag via Web NFC
   */
  public async writeToPhysicalTag(state: NtagDialState): Promise<{ success: boolean; message: string }> {
    if (!this.isWebNfcAvailable) {
      this.saveActiveTagState();
      return {
        success: true,
        message: 'Saved to virtual NTAG215 EEPROM (Hardware Web NFC unavailable in current browser)',
      };
    }

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const writer = new NDEFReaderClass();
      const payload = serializeNdefPayload(state);

      await writer.write({
        records: [
          {
            recordType: 'text',
            data: payload,
          },
        ],
      });

      this.saveActiveTagState();
      return {
        success: true,
        message: `Successfully written to physical NTAG215 EEPROM (Value: ${state.value}${state.unit})!`,
      };
    } catch (err: any) {
      this.saveActiveTagState();
      return {
        success: false,
        message: `Physical NFC write failed (${err.message || 'Tag disconnected early'}). Saved to virtual EEPROM.`,
      };
    }
  }
}

export const nfcService = new NfcService();
