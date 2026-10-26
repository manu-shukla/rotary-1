/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Disc3,
  Sliders,
  Smartphone,
  Cpu,
  RotateCw,
  Lightbulb,
  Volume2,
  Film,
  Lock,
  Sparkles,
  Info,
} from 'lucide-react';
import { PREDEFINED_TAGS, PredefinedTag, nfcService } from './lib/nfcService';
import { NtagDialState, applyRotaryDeltaToValue, calculateAngularDelta } from './lib/sensorFusion';
import { audioHaptics } from './lib/audioHaptics';
import { PhoneDialStage } from './components/PhoneDialStage';
import { DeviceControls } from './components/DeviceControls';
import { NfcDiagnosticsModal } from './components/NfcDiagnosticsModal';
import { SensorDiagnosticsBar } from './components/SensorDiagnosticsBar';

export default function App() {
  const [selectedTag, setSelectedTag] = useState<PredefinedTag>(PREDEFINED_TAGS[0]);
  const [dialState, setDialState] = useState<NtagDialState>(nfcService.getActiveTag());
  const [phoneDistanceMm, setPhoneDistanceMm] = useState<number>(2); // 2mm = placed flat on tag
  const [isCoupled, setIsCoupled] = useState<boolean>(true);
  const [isWritingEeprom, setIsWritingEeprom] = useState<boolean>(false);
  const [lastDirection, setLastDirection] = useState<'cw' | 'ccw' | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [lastWriteTime, setLastWriteTime] = useState<number>(Date.now());
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [isHapticsEnabled, setIsHapticsEnabled] = useState<boolean>(true);
  const [gyroActive, setGyroActive] = useState<boolean>(false);
  const [phoneYaw, setPhoneYaw] = useState<number>(0);

  // References for continuous sensor tracking
  const initialLockYawRef = useRef<number | null>(null);
  const prevDeviceYawRef = useRef<number | null>(null);

  // Change active tag
  const handleSelectTag = (tag: PredefinedTag) => {
    // If currently coupled, commit current tag state before switching
    if (isCoupled) {
      nfcService.saveActiveTagState();
    }
    setSelectedTag(tag);
    const newState = nfcService.setActiveTag(tag);
    setDialState(newState);
    audioHaptics.playNfcConnectSound();
  };

  // Delta angle applied from rotary twist (e.g. from mouse/touch twist or keyboard or mobile gyro)
  const handleAngleDelta = useCallback(
    (deltaDeg: number, direction: 'cw' | 'ccw', ticks: number) => {
      setLastDirection(direction);

      setDialState((prev) => {
        let stepPerTick = 1;
        let wrap = false;

        if (prev.mode === 'light' || prev.mode === 'volume') {
          stepPerTick = 1;
        } else if (prev.mode === 'video') {
          stepPerTick = 1; // 1 frame per tick
        } else if (prev.mode === 'safe') {
          stepPerTick = 1;
          wrap = true;
        }

        const nextVal = applyRotaryDeltaToValue(
          prev.value,
          ticks,
          direction,
          stepPerTick,
          prev.minVal,
          prev.maxVal,
          wrap
        );

        return {
          ...prev,
          value: nextVal,
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  // Handle phone lift or drop
  const handleCouplingChange = useCallback(
    (coupled: boolean) => {
      setIsCoupled(coupled);

      if (coupled) {
        // Phone dropped onto tag: Establish RF continuous session
        initialLockYawRef.current = phoneYaw;
        audioHaptics.playNfcConnectSound();
      } else {
        // Phone lifted away: RF field breaks -> Write directly back to NTAG215 EEPROM
        setIsWritingEeprom(true);
        audioHaptics.playNfcDisconnectAndWriteSound();

        // Flash EEPROM persistence
        nfcService.updateActiveTagValue(dialState.value);
        nfcService.saveActiveTagState();
        setLastWriteTime(Date.now());

        setTimeout(() => {
          setIsWritingEeprom(false);
        }, 900);
      }
    },
    [dialState.value, phoneYaw]
  );

  // Update step sensitivity (2, 5, 10, 15 deg)
  const handleUpdateStepDeg = (stepDeg: number) => {
    setDialState((prev) => ({
      ...prev,
      stepDeg,
    }));
  };

  // Direct value changes from appliance interactive widgets
  const handleValueChange = (val: number) => {
    setDialState((prev) => ({
      ...prev,
      value: val,
      updatedAt: Date.now(),
    }));
  };

  // Toggle sound
  const handleToggleSound = () => {
    const next = !isSoundEnabled;
    setIsSoundEnabled(next);
    audioHaptics.setSoundEnabled(next);
  };

  // Toggle haptics
  const handleToggleHaptics = () => {
    const next = !isHapticsEnabled;
    setIsHapticsEnabled(next);
    audioHaptics.setHapticsEnabled(next);
  };

  // Real mobile device gyroscope integration (DeviceOrientationEvent)
  const requestGyroPermission = async () => {
    if (typeof window === 'undefined') return;

    if (
      typeof (DeviceOrientationEvent as any) !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          startDeviceOrientationTracking();
        }
      } catch {
        startDeviceOrientationTracking();
      }
    } else {
      startDeviceOrientationTracking();
    }
  };

  const startDeviceOrientationTracking = () => {
    if (typeof window === 'undefined') return;

    const onOrientation = (e: DeviceOrientationEvent) => {
      // e.alpha represents compass yaw (0 to 360 deg)
      if (e.alpha !== null && typeof e.alpha !== 'undefined') {
        const rawYaw = e.alpha;
        setPhoneYaw(rawYaw);
        setGyroActive(true);

        if (prevDeviceYawRef.current !== null && isCoupled) {
          const delta = calculateAngularDelta(rawYaw, prevDeviceYawRef.current);
          if (Math.abs(delta) >= dialState.stepDeg) {
            const dir = delta > 0 ? 'cw' : 'ccw';
            const ticks = Math.floor(Math.abs(delta) / dialState.stepDeg);
            handleAngleDelta(ticks * dialState.stepDeg, dir, ticks);
            prevDeviceYawRef.current = rawYaw;
          }
        } else {
          prevDeviceYawRef.current = rawYaw;
        }
      }
    };

    window.addEventListener('deviceorientation', onOrientation);
  };

  // Initialize Web NFC and Orientation listener on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'ondeviceorientation' in window) {
      startDeviceOrientationTracking();
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#090a0c] text-neutral-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl metallic-dial-gradient border border-neutral-600/60 shadow-lg flex items-center justify-center">
            <Disc3 className="w-6 h-6 text-amber-400 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-neutral-100 font-display">
                TAP &amp; TWIST
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                NFC + GYRO SENSOR FUSION
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-mono">
              Turn your smartphone into a mechanical rotary dial via NTAG215
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={requestGyroPermission}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono border border-neutral-700 transition-colors"
            title="Enable hardware gyroscope on mobile"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span>{gyroActive ? 'Gyro Locked' : 'Enable Mobile Sensors'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs font-mono transition-colors shadow-sm"
          >
            <Cpu className="w-3.5 h-3.5 text-neutral-950" />
            <span>NTAG215 Lab</span>
          </button>
        </div>
      </header>

      {/* Tag Selector Bar (Physical Tag Presets) */}
      <div className="bg-neutral-950/50 border-b border-neutral-800/80 px-6 py-2.5 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-400 shrink-0">ACTIVE NTAG215 TAG:</span>
          <div className="flex items-center gap-2">
            {PREDEFINED_TAGS.map((tag) => {
              const isSelected = selectedTag.id === tag.id;
              const Icon =
                tag.mode === 'light'
                  ? Lightbulb
                  : tag.mode === 'volume'
                  ? Volume2
                  : tag.mode === 'video'
                  ? Film
                  : Lock;

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleSelectTag(tag)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                    isSelected
                      ? 'bg-neutral-800 text-amber-300 border border-amber-500/50 shadow-sm'
                      : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-neutral-200 hover:bg-neutral-850'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-neutral-500'}`} />
                  <span>{tag.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Interactive Phone + Dial + NFC Coaster Stage (7 cols) */}
        <section className="lg:col-span-7 flex flex-col justify-center">
          <PhoneDialStage
            dialState={dialState}
            onAngleDelta={handleAngleDelta}
            phoneDistanceMm={phoneDistanceMm}
            setPhoneDistanceMm={setPhoneDistanceMm}
            isCoupled={isCoupled}
            onCouplingChange={handleCouplingChange}
            isWritingEeprom={isWritingEeprom}
          />
        </section>

        {/* Right Column: Live Appliance Controller (5 cols) */}
        <section className="lg:col-span-5 flex flex-col justify-center">
          <DeviceControls
            dialState={dialState}
            onValueChange={handleValueChange}
            lastDirection={lastDirection}
          />
        </section>
      </main>

      {/* Bottom Telemetry & Diagnostics Bar */}
      <SensorDiagnosticsBar
        isCoupled={isCoupled}
        phoneYaw={phoneYaw}
        gyroActive={gyroActive}
        onToggleSound={handleToggleSound}
        isSoundEnabled={isSoundEnabled}
        onToggleHaptics={handleToggleHaptics}
        isHapticsEnabled={isHapticsEnabled}
        lastWriteTime={lastWriteTime}
      />

      {/* NTAG215 Technical Modal */}
      <NfcDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        dialState={dialState}
        onUpdateStepDeg={handleUpdateStepDeg}
      />
    </div>
  );
}
