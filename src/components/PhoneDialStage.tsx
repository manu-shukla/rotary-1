/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Smartphone, Disc3, Radio, ArrowUpCircle, ArrowDownCircle, RotateCw, RotateCcw, Volume2, ShieldCheck, Sparkles } from 'lucide-react';
import { NtagDialState, calculateAngularDelta, calculateDetentTicks, normalizeAngle } from '../lib/sensorFusion';
import { audioHaptics } from '../lib/audioHaptics';

interface PhoneDialStageProps {
  dialState: NtagDialState;
  onAngleDelta: (deltaDeg: number, direction: 'cw' | 'ccw', ticks: number) => void;
  phoneDistanceMm: number;
  setPhoneDistanceMm: (mm: number) => void;
  isCoupled: boolean;
  onCouplingChange: (coupled: boolean) => void;
  isWritingEeprom: boolean;
}

export const PhoneDialStage: React.FC<PhoneDialStageProps> = ({
  dialState,
  onAngleDelta,
  phoneDistanceMm,
  setPhoneDistanceMm,
  isCoupled,
  onCouplingChange,
  isWritingEeprom,
}) => {
  const [phoneYawDeg, setPhoneYawDeg] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastTickDirection, setLastTickDirection] = useState<'cw' | 'ccw' | null>(null);
  const [totalTicksFired, setTotalTicksFired] = useState<number>(0);

  const dialContainerRef = useRef<HTMLDivElement>(null);
  const prevAngleRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);

  // Handle angle rotation delta
  const handleRotationInput = useCallback(
    (newAngle: number) => {
      if (!isCoupled) return;

      const delta = calculateAngularDelta(newAngle, prevAngleRef.current);
      prevAngleRef.current = newAngle;
      setPhoneYawDeg(normalizeAngle(newAngle));

      accumulatorRef.current += delta;
      const detent = calculateDetentTicks(accumulatorRef.current, dialState.stepDeg);

      if (detent.ticks > 0 && detent.direction) {
        accumulatorRef.current = detent.remainingAccumulator;
        setLastTickDirection(detent.direction);
        setTotalTicksFired((prev) => prev + detent.ticks);

        // Fire audio & haptics
        audioHaptics.playDetentTick(detent.direction, detent.ticks);

        // Send to parent state
        onAngleDelta(detent.ticks * dialState.stepDeg, detent.direction, detent.ticks);
      }
    },
    [isCoupled, dialState.stepDeg, onAngleDelta]
  );

  // Mouse / Touch drag to twist phone around center
  const calculateAngleFromPointer = (clientX: number, clientY: number): number | null => {
    if (!dialContainerRef.current) return null;
    const rect = dialContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rad = Math.atan2(clientY - centerY, clientX - centerX);
    let deg = (rad * 180) / Math.PI;
    deg = (deg + 90 + 360) % 360; // 0 deg is pointing straight up
    return deg;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isCoupled) return;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const angle = calculateAngleFromPointer(e.clientX, e.clientY);
    if (angle !== null) {
      prevAngleRef.current = angle;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !isCoupled) return;
    const angle = calculateAngleFromPointer(e.clientX, e.clientY);
    if (angle !== null) {
      handleRotationInput(angle);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  // Keyboard shortcut listeners (ArrowLeft, ArrowRight, [ , ])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCoupled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === ']' || e.key === 'l') {
        e.preventDefault();
        const nextAngle = normalizeAngle(phoneYawDeg + dialState.stepDeg);
        handleRotationInput(nextAngle);
      } else if (e.key === 'ArrowLeft' || e.key === '[' || e.key === 'j') {
        e.preventDefault();
        const nextAngle = normalizeAngle(phoneYawDeg - dialState.stepDeg);
        handleRotationInput(nextAngle);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCoupled, phoneYawDeg, dialState.stepDeg, handleRotationInput]);

  // Stepper buttons
  const stepManual = (direction: 'cw' | 'ccw', degrees: number) => {
    if (!isCoupled) return;
    const step = direction === 'cw' ? degrees : -degrees;
    const nextAngle = normalizeAngle(phoneYawDeg + step);
    handleRotationInput(nextAngle);
  };

  // Distance change (lifting or placing phone)
  const handleDistanceChange = (newDistance: number) => {
    setPhoneDistanceMm(newDistance);
    const nowCoupled = newDistance <= 20;
    if (nowCoupled !== isCoupled) {
      onCouplingChange(nowCoupled);
    }
  };

  const toggleCoupling = () => {
    if (isCoupled) {
      handleDistanceChange(28); // Lift off (> 20mm breaks RF loop)
    } else {
      handleDistanceChange(2); // Touch back down
    }
  };

  // Visual dial tick graduation lines (every 10 deg, longer at 30 deg)
  const dialTicks = Array.from({ length: 36 }).map((_, i) => {
    const angle = i * 10;
    const isMajor = angle % 30 === 0;
    return (
      <div
        key={angle}
        className={`absolute top-0 left-1/2 -translate-x-1/2 origin-bottom transition-opacity duration-300 ${
          isMajor ? 'w-0.5 h-3 bg-amber-400/80' : 'w-px h-1.5 bg-neutral-600/60'
        }`}
        style={{
          transform: `rotate(${angle}deg)`,
          transformOrigin: '50% 120px',
        }}
      />
    );
  });

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
      {/* Background radial atmosphere */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
          isCoupled ? 'opacity-100' : 'opacity-20'
        }`}
        style={{
          background: 'radial-gradient(circle at 50% 45%, rgba(245, 158, 11, 0.12) 0%, transparent 65%)',
        }}
      />

      {/* Top Status & RF Indicator Header */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4 z-10">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
              isCoupled ? 'bg-amber-400 animate-pulse' : 'bg-neutral-600'
            }`}
          />
          <span className="text-xs uppercase tracking-wider font-mono font-medium text-neutral-300">
            {isCoupled ? 'NFC-A Active (13.56 MHz)' : 'RF Field Broken (Lifted)'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-neutral-400">Gap:</span>
          <span className={`font-semibold ${isCoupled ? 'text-amber-400' : 'text-rose-400'}`}>
            {phoneDistanceMm.toFixed(1)}mm {isCoupled ? '(Coupled ≤20mm)' : '(Lost >20mm)'}
          </span>
        </div>
      </div>

      {/* Physical Dial Stage Workspace */}
      <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center select-none my-2">
        {/* Base Coaster: Wooden / Matte Aluminum Pad with embedded NTAG215 Coil */}
        <div
          className={`absolute w-64 h-64 md:w-72 md:h-72 rounded-full border-4 border-amber-950/70 shadow-2xl transition-all duration-500 flex items-center justify-center ${
            isCoupled ? 'rf-active-ring' : 'border-neutral-800 opacity-60'
          }`}
          style={{
            background: 'radial-gradient(circle, #1a1612 0%, #12100d 70%, #0a0908 100%)',
            boxShadow: isCoupled
              ? '0 0 35px rgba(217, 119, 6, 0.35), inset 0 0 20px rgba(245, 158, 11, 0.2)'
              : 'none',
          }}
        >
          {/* Concentric Copper NFC Antenna Traces */}
          <div className="w-52 h-52 rounded-full border border-amber-600/30 flex items-center justify-center">
            <div className="w-44 h-44 rounded-full border border-amber-600/40 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border border-amber-500/50 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full border border-dashed border-amber-400/60 flex items-center justify-center">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 text-center px-2">
                    NTAG215
                    <br />
                    13.56 MHz
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rotary Dial Ring with Knurled Bezel & Ticks */}
        <div
          ref={dialContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative w-60 h-60 md:w-68 md:h-68 rounded-full cursor-grab active:cursor-grabbing transition-transform duration-75 flex items-center justify-center z-20 ${
            isCoupled ? 'shadow-2xl' : 'opacity-75'
          }`}
          style={{
            transform: `rotate(${phoneYawDeg}deg) scale(${isCoupled ? 1 : 0.94})`,
            transformOrigin: 'center center',
            touchAction: 'none',
          }}
          title="Click and drag around the center to twist phone against the NFC sticker"
        >
          {/* Metallic outer knurled bezel */}
          <div className="absolute inset-0 rounded-full knurled-edge opacity-35" />
          <div className="absolute inset-1 rounded-full metallic-dial-gradient border-2 border-neutral-700/80 shadow-inner flex items-center justify-center">
            {/* Dial Ticks Container */}
            <div className="relative w-60 h-60 flex items-center justify-center pointer-events-none">
              {dialTicks}
            </div>

            {/* Smartphone body overlay representation */}
            <div className="absolute w-32 h-56 md:w-36 md:h-60 rounded-2xl bg-neutral-900/90 border-2 border-neutral-600 shadow-2xl flex flex-col items-center justify-between p-3 backdrop-blur-md">
              {/* Phone Speaker grill & front camera notch */}
              <div className="w-12 h-1 bg-neutral-700 rounded-full mb-1" />

              {/* Phone display showing live rotary orientation */}
              <div className="flex-1 w-full bg-neutral-950/80 rounded-lg border border-neutral-800 p-2 flex flex-col items-center justify-center">
                <Smartphone className="w-5 h-5 text-amber-400 mb-1" />
                <div className="text-[10px] uppercase font-mono tracking-widest text-neutral-400">GYRO YAW</div>
                <div className="text-sm font-mono font-bold text-amber-300">
                  {Math.round(phoneYawDeg)}°
                </div>
                <div className="text-[9px] font-mono text-neutral-400 mt-1">
                  ±{dialState.stepDeg}° Detent
                </div>
              </div>

              {/* Home indicator bar */}
              <div className="w-10 h-1 bg-neutral-600 rounded-full mt-1" />
            </div>

            {/* Glowing Dial Index Pointer / Arrow on Outer Ring */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              <div className="w-2.5 h-4 bg-amber-400 rounded-b shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
              <div className="w-1 h-2 bg-amber-300" />
            </div>
          </div>
        </div>

        {/* EEPROM Flash Overlay Indicator when phone is lifted */}
        {isWritingEeprom && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950/85 rounded-full backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
            <Sparkles className="w-8 h-8 text-amber-400 animate-spin mb-1" />
            <span className="text-xs font-mono font-bold text-amber-300 tracking-wider">
              WRITING EEPROM...
            </span>
            <span className="text-[10px] font-mono text-neutral-400">
              Saving {dialState.value} {dialState.unit}
            </span>
          </div>
        )}
      </div>

      {/* Manual Twist Controls & Detents HUD */}
      <div className="w-full flex flex-col gap-3 mt-4 z-10">
        {/* Main Lift / Place Phone Button */}
        <button
          type="button"
          onClick={toggleCoupling}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-md ${
            isCoupled
              ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold shadow-amber-500/20 active:scale-[0.99]'
              : 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-500/40 active:scale-[0.99]'
          }`}
        >
          {isCoupled ? (
            <>
              <ArrowUpCircle className="w-4 h-4 text-neutral-950 shrink-0" />
              <span>Lift Phone (Commit Position to NTAG215 EEPROM)</span>
            </>
          ) : (
            <>
              <ArrowDownCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Place Phone Down on NTAG215</span>
            </>
          )}
        </button>

        {/* 4-Step Quick Twist Buttons */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => stepManual('ccw', 15)}
            disabled={!isCoupled}
            className="flex items-center justify-center gap-1 py-2 px-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono text-neutral-200 transition-colors border border-neutral-700"
            title="Twist counter-clockwise 15°"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>-15°</span>
          </button>
          <button
            type="button"
            onClick={() => stepManual('ccw', dialState.stepDeg)}
            disabled={!isCoupled}
            className="flex items-center justify-center gap-1 py-2 px-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono text-neutral-200 transition-colors border border-neutral-700"
            title={`Twist counter-clockwise 1 tick (${dialState.stepDeg}°)`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>-{dialState.stepDeg}°</span>
          </button>
          <button
            type="button"
            onClick={() => stepManual('cw', dialState.stepDeg)}
            disabled={!isCoupled}
            className="flex items-center justify-center gap-1 py-2 px-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono text-neutral-200 transition-colors border border-neutral-700"
            title={`Twist clockwise 1 tick (${dialState.stepDeg}°)`}
          >
            <span>+{dialState.stepDeg}°</span>
            <RotateCw className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => stepManual('cw', 15)}
            disabled={!isCoupled}
            className="flex items-center justify-center gap-1 py-2 px-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono text-neutral-200 transition-colors border border-neutral-700"
            title="Twist clockwise 15°"
          >
            <span>+15°</span>
            <RotateCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </button>
        </div>

        {/* Distance Slider (Simulating phone Z-axis distance in mm) */}
        <div className="flex items-center justify-between gap-3 px-2 bg-neutral-950/60 py-2 rounded-xl border border-neutral-800">
          <label htmlFor="distance-slider" className="text-xs font-mono text-neutral-400 shrink-0">
            Z-Axis Gap:
          </label>
          <input
            id="distance-slider"
            type="range"
            min="0"
            max="35"
            step="0.5"
            value={phoneDistanceMm}
            onChange={(e) => handleDistanceChange(parseFloat(e.target.value))}
            className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-neutral-300 w-12 text-right shrink-0">
            {phoneDistanceMm.toFixed(1)}mm
          </span>
        </div>

        {/* Interactive hint footer */}
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 px-1">
          <span>Tip: Click & twist dial or press [ / ] or ← / →</span>
          <span className="text-amber-400/80">Ticks Fired: {totalTicksFired}</span>
        </div>
      </div>
    </div>
  );
};
