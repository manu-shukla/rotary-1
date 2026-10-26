/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Compass, Radio, Activity, Volume2, VolumeX, Vibrate } from 'lucide-react';
import { audioHaptics } from '../lib/audioHaptics';

interface SensorDiagnosticsBarProps {
  isCoupled: boolean;
  phoneYaw: number;
  gyroActive: boolean;
  onToggleSound: () => void;
  isSoundEnabled: boolean;
  onToggleHaptics: () => void;
  isHapticsEnabled: boolean;
  lastWriteTime: number;
}

export const SensorDiagnosticsBar: React.FC<SensorDiagnosticsBarProps> = ({
  isCoupled,
  phoneYaw,
  gyroActive,
  onToggleSound,
  isSoundEnabled,
  onToggleHaptics,
  isHapticsEnabled,
  lastWriteTime,
}) => {
  return (
    <div className="w-full bg-neutral-900/90 border-t border-neutral-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-400 backdrop-blur-md">
      {/* Telemetry Chips */}
      <div className="flex flex-wrap items-center gap-4">
        {/* RF Carrier Loop */}
        <div className="flex items-center gap-1.5">
          <Radio className={`w-3.5 h-3.5 ${isCoupled ? 'text-amber-400 animate-pulse' : 'text-neutral-500'}`} />
          <span>RF Presence:</span>
          <span className={`font-semibold ${isCoupled ? 'text-amber-400' : 'text-neutral-500'}`}>
            {isCoupled ? 'LOCKED (-38 dBm)' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Gyroscope Yaw */}
        <div className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-neutral-400" />
          <span>Yaw:</span>
          <span className="text-neutral-200 font-semibold">{phoneYaw.toFixed(1)}°</span>
          <span className="text-[10px] text-neutral-500">
            ({gyroActive ? 'Hardware Gyro' : 'Virtual Tracker'})
          </span>
        </div>

        {/* EEPROM Status */}
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-neutral-400" />
          <span>EEPROM:</span>
          <span className="text-neutral-300">
            {lastWriteTime ? `Synced ${new Date(lastWriteTime).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}` : 'Standby'}
          </span>
        </div>
      </div>

      {/* Audio & Haptic quick switches */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={isSoundEnabled ? 'Mute mechanical clicks' : 'Enable mechanical clicks'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
            isSoundEnabled
              ? 'bg-neutral-800 border-neutral-700 text-amber-300'
              : 'bg-neutral-950 border-neutral-800 text-neutral-500'
          }`}
        >
          {isSoundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>Audio Clicks</span>
        </button>

        <button
          type="button"
          onClick={onToggleHaptics}
          aria-label={isHapticsEnabled ? 'Disable vibration' : 'Enable vibration'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
            isHapticsEnabled
              ? 'bg-neutral-800 border-neutral-700 text-amber-300'
              : 'bg-neutral-950 border-neutral-800 text-neutral-500'
          }`}
        >
          <Vibrate className="w-3.5 h-3.5" />
          <span>Haptics</span>
        </button>
      </div>
    </div>
  );
};
