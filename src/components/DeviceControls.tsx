/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Lightbulb,
  Volume2,
  Film,
  ShieldAlert,
  ShieldCheck,
  Play,
  Pause,
  KeyRound,
  CheckCircle2,
  Lock,
  Unlock,
  Radio,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { NtagDialState, evaluateSafeDialProgress, SafeCombinationStep } from '../lib/sensorFusion';
import { audioHaptics } from '../lib/audioHaptics';

interface DeviceControlsProps {
  dialState: NtagDialState;
  onValueChange: (val: number) => void;
  lastDirection: 'cw' | 'ccw' | null;
}

export const DeviceControls: React.FC<DeviceControlsProps> = ({ dialState, onValueChange, lastDirection }) => {
  // Safe combination state
  const safeSteps: SafeCombinationStep[] = [
    { target: 45, direction: 'cw', tolerance: 2 },
    { target: 18, direction: 'ccw', tolerance: 2 },
    { target: 72, direction: 'cw', tolerance: 2 },
  ];
  const [safeStepIdx, setSafeStepIdx] = useState<number>(0);
  const [safeUnlocked, setSafeUnlocked] = useState<boolean>(false);
  const [safeFeedback, setSafeFeedback] = useState<string>('Step 1: Turn CW (Right) to 45');

  // Video timeline playback
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(false);

  // Hi-Fi audio test tone
  const [isTestTonePlaying, setIsTestTonePlaying] = useState<boolean>(false);
  const toneOscRef = useRef<OscillatorNode | null>(null);
  const toneGainRef = useRef<GainNode | null>(null);
  const toneCtxRef = useRef<AudioContext | null>(null);

  // Track safe dial progress whenever value or direction changes
  useEffect(() => {
    if (dialState.mode === 'safe' && !safeUnlocked) {
      const dialNumber = Math.round(dialState.value) % 100;
      const progress = evaluateSafeDialProgress(safeSteps, safeStepIdx, dialNumber, lastDirection);

      if (progress.currentStepIndex !== safeStepIdx) {
        setSafeStepIdx(progress.currentStepIndex);
        setSafeFeedback(progress.message);

        if (progress.unlocked) {
          setSafeUnlocked(true);
          audioHaptics.playVaultUnlockSound();
        } else {
          audioHaptics.playDetentTick('cw', 2);
        }
      }
    }
  }, [dialState.value, dialState.mode, lastDirection, safeStepIdx, safeUnlocked]);

  // Video play timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (dialState.mode === 'video' && isPlayingVideo) {
      interval = setInterval(() => {
        onValueChange(dialState.value >= 900 ? 0 : dialState.value + 1);
      }, 1000 / 24); // 24 FPS
    }
    return () => clearInterval(interval);
  }, [isPlayingVideo, dialState.value, dialState.mode, onValueChange]);

  // Hi-Fi test tone volume adjustment
  useEffect(() => {
    if (toneGainRef.current && isTestTonePlaying) {
      // Map volume 0-100 to gain 0.0 - 0.3
      const gainVal = (dialState.value / 100) * 0.25;
      toneGainRef.current.gain.setTargetAtTime(gainVal, toneCtxRef.current?.currentTime || 0, 0.05);
    }
  }, [dialState.value, isTestTonePlaying]);

  const toggleTestTone = () => {
    if (isTestTonePlaying) {
      if (toneOscRef.current) {
        toneOscRef.current.stop();
        toneOscRef.current.disconnect();
        toneOscRef.current = null;
      }
      setIsTestTonePlaying(false);
    } else {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      toneCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // Warm A3 tone
      const gainVal = (dialState.value / 100) * 0.25;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      toneOscRef.current = osc;
      toneGainRef.current = gain;
      setIsTestTonePlaying(true);
    }
  };

  const resetSafe = () => {
    setSafeStepIdx(0);
    setSafeUnlocked(false);
    setSafeFeedback('Step 1: Turn CW (Right) to 45');
    onValueChange(0);
  };

  // ----------------------------------------------------
  // MODE 1: SMART LIGHT
  // ----------------------------------------------------
  if (dialState.mode === 'light') {
    const brightnessPct = Math.round(dialState.value);
    // 2200K (amber) to 6500K (cool white)
    const kelvin = Math.round(2200 + (brightnessPct / 100) * 4300);
    const lumens = Math.round((brightnessPct / 100) * 1600);

    // Warmth color interpolation
    const r = 255;
    const g = Math.round(160 + (brightnessPct / 100) * 75);
    const b = Math.round(60 + (brightnessPct / 100) * 195);
    const glowColor = `rgb(${r}, ${g}, ${b})`;

    return (
      <div className="flex flex-col h-full bg-neutral-900/90 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden backdrop-blur-md">
        {/* Ambient Room Illumination */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-300"
          style={{
            background: `radial-gradient(circle at 50% 35%, rgba(${r}, ${g}, ${b}, ${
              (brightnessPct / 100) * 0.45
            }) 0%, transparent 70%)`,
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-6 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Living Room Ambient Dimmer</h3>
              <p className="text-xs text-neutral-400 font-mono">Continuous NTAG215 Lumens & Kelvin Controller</p>
            </div>
          </div>
          <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-md bg-neutral-800 text-amber-300 border border-neutral-700">
            {kelvin} K
          </span>
        </div>

        {/* Center: Glowing Filament Bulb */}
        <div className="flex-1 flex flex-col items-center justify-center relative my-4 z-10">
          <div
            className="w-32 h-32 rounded-full border-2 border-neutral-700/80 flex items-center justify-center transition-all duration-300 relative shadow-2xl"
            style={{
              backgroundColor: `rgba(${r}, ${g}, ${b}, ${Math.max(0.1, (brightnessPct / 100) * 0.6)})`,
              boxShadow: `0 0 ${brightnessPct * 0.7}px ${glowColor}, inset 0 0 ${brightnessPct * 0.4}px ${glowColor}`,
            }}
          >
            {/* Filament Coil */}
            <div
              className="w-12 h-16 border-2 border-amber-300 rounded-full flex items-center justify-center transition-opacity"
              style={{
                opacity: Math.max(0.2, brightnessPct / 100),
                filter: `drop-shadow(0 0 8px ${glowColor})`,
              }}
            >
              <div className="w-6 h-10 border-t-2 border-amber-200" />
            </div>
          </div>

          {/* Big Digital Readout */}
          <div className="mt-6 text-center">
            <div className="text-4xl font-extrabold tracking-tight font-mono text-neutral-100">
              {brightnessPct}
              <span className="text-amber-400 text-2xl ml-1">%</span>
            </div>
            <div className="text-xs font-mono text-neutral-400 mt-1">
              Output: <span className="text-neutral-200 font-semibold">{lumens} Lumens</span> · Color Temp:{' '}
              <span className="text-amber-300">{kelvin}K</span>
            </div>
          </div>
        </div>

        {/* Bottom Kelvin spectrum bar */}
        <div className="z-10 mt-2">
          <div className="flex justify-between text-[11px] font-mono text-neutral-400 mb-1.5">
            <span>2200K Candlelight</span>
            <span>4000K Neutral</span>
            <span>6500K Daylight</span>
          </div>
          <div className="h-2 rounded-full w-full bg-gradient-to-r from-amber-600 via-amber-200 to-sky-300 overflow-hidden p-0.5">
            <div
              className="h-full w-2 bg-neutral-950 rounded-full shadow-md transition-all duration-150"
              style={{ marginLeft: `calc(${brightnessPct}% - 8px)` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MODE 2: HI-FI VOLUME & ANALOG VU METERS
  // ----------------------------------------------------
  if (dialState.mode === 'volume') {
    const volPct = Math.round(dialState.value);
    // -80 dB (mute) to +6 dB (peak)
    const dbVal = volPct === 0 ? -80 : Math.round(-60 + (volPct / 100) * 66);
    // VU meter needle angles (-45 deg to +45 deg)
    const needleAngle = -45 + (volPct / 100) * 90;

    return (
      <div className="flex flex-col h-full bg-neutral-900/90 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Class-A Audiophile Master Gain</h3>
              <p className="text-xs text-neutral-400 font-mono">Analog Stepped Attenuator · NTAG215 Linked</p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTestTone}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
              isTestTonePlaying
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {isTestTonePlaying ? 'Stop Test Tone' : 'Play Test Tone'}
          </button>
        </div>

        {/* Vintage Dual VU Needle Meters */}
        <div className="grid grid-cols-2 gap-3 my-2 z-10">
          {['LEFT CHANNEL', 'RIGHT CHANNEL'].map((channel, idx) => (
            <div
              key={channel}
              className="bg-neutral-950 rounded-xl border border-neutral-800 p-3 flex flex-col items-center shadow-inner relative overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #18191c 0%, #0d0e10 100%)',
              }}
            >
              {/* Backlit dial glow */}
              <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                  background: 'radial-gradient(circle at 50% 90%, rgba(245, 158, 11, 0.4) 0%, transparent 70%)',
                }}
              />

              <div className="flex justify-between w-full text-[9px] font-mono text-neutral-400 mb-1">
                <span>-20</span>
                <span>-10</span>
                <span>-5</span>
                <span>0</span>
                <span className="text-rose-400">+3 dB</span>
              </div>

              {/* Meter Dial Arc */}
              <div className="relative w-full h-16 flex items-end justify-center overflow-hidden">
                <div className="w-28 h-28 border-t-2 border-neutral-600 rounded-full absolute -bottom-10" />

                {/* Animated Needle */}
                <div
                  className="w-0.5 h-14 bg-rose-500 origin-bottom transition-transform duration-100 absolute bottom-0 shadow-sm"
                  style={{
                    transform: `rotate(${needleAngle + (idx === 1 ? -1 : 1)}deg)`,
                  }}
                />
                {/* Needle pivot cap */}
                <div className="w-3 h-3 rounded-full bg-neutral-400 border border-neutral-900 absolute -bottom-1.5 z-10" />
              </div>

              <div className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 mt-2 font-medium">
                {channel}
              </div>
            </div>
          ))}
        </div>

        {/* Decibel & Percentage Big Readout */}
        <div className="flex-1 flex flex-col items-center justify-center z-10 my-2">
          <div className="text-4xl font-extrabold tracking-tight font-mono text-neutral-100">
            {dbVal > 0 ? `+${dbVal}` : dbVal}
            <span className="text-amber-400 text-2xl ml-1">dB</span>
          </div>
          <div className="text-xs font-mono text-neutral-400 mt-1">
            Attenuator Position: <span className="text-neutral-200 font-semibold">{volPct}%</span> · Step:{' '}
            <span className="text-amber-400">±{dialState.stepDeg}°</span>
          </div>
        </div>

        {/* Channel Balance & Status */}
        <div className="z-10 flex items-center justify-between px-3 py-2 bg-neutral-950/70 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-400">
          <span>THD+N: 0.0008%</span>
          <span className="text-emerald-400">Pure Copper RF Ground</span>
          <span>Damping: 1000</span>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MODE 3: CINEMA JOG & SHUTTLE VIDEO
  // ----------------------------------------------------
  if (dialState.mode === 'video') {
    const totalFrames = Math.round(dialState.value);
    const fps = 24;
    const hours = Math.floor(totalFrames / (fps * 3600));
    const minutes = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
    const seconds = Math.floor((totalFrames % (fps * 60)) / fps);
    const frames = totalFrames % fps;

    const timecode = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0'
    )}:${String(frames).padStart(2, '0')}`;

    return (
      <div className="flex flex-col h-full bg-neutral-900/90 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Post-Production Jog/Shuttle</h3>
              <p className="text-xs text-neutral-400 font-mono">24.000 FPS Sub-Frame Precision</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPlayingVideo(!isPlayingVideo)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono transition-colors border border-neutral-700"
          >
            {isPlayingVideo ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
            {isPlayingVideo ? 'Pause' : 'Play 1x'}
          </button>
        </div>

        {/* Video Canvas Preview Mock */}
        <div className="w-full h-36 bg-neutral-950 rounded-xl border border-neutral-800 relative overflow-hidden flex items-center justify-center shadow-inner z-10">
          {/* Film Grain & Aspect Frame */}
          <div className="absolute inset-0 bg-neutral-950/40" />
          <div className="text-center z-10">
            <div className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
              {timecode}
            </div>
            <div className="text-[10px] font-mono text-neutral-400 mt-1">
              REC 709 · ProRes 422 HQ · Frame #{totalFrames}
            </div>
          </div>

          {/* Filmstrip Sprocket Holes */}
          <div className="absolute top-0 left-0 right-0 h-3 flex justify-between px-2 opacity-30">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-3 h-2 bg-neutral-600 rounded-xs" />
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-3 flex justify-between px-2 opacity-30">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-3 h-2 bg-neutral-600 rounded-xs" />
            ))}
          </div>
        </div>

        {/* Scrubbing Timeline Bar */}
        <div className="my-4 z-10">
          <div className="flex justify-between text-xs font-mono text-neutral-400 mb-1">
            <span>00:00:00:00</span>
            <span className="text-amber-400 font-semibold">{totalFrames} / 900 Frames</span>
            <span>00:00:37:12</span>
          </div>
          <div className="relative h-4 bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
            {/* Filmstrip Tick Marks */}
            <div className="absolute inset-0 flex justify-between px-1 opacity-20">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="w-px h-full bg-neutral-300" />
              ))}
            </div>
            {/* Progress Fill */}
            <div
              className="h-full bg-amber-500/30 border-r-2 border-amber-400 transition-all duration-75"
              style={{ width: `${(totalFrames / 900) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="z-10 flex items-center justify-between text-[11px] font-mono text-neutral-400 px-1">
          <span>Twist phone 5° = 1 Frame Step</span>
          <span className="text-amber-300">Shuttle Velocity: {isPlayingVideo ? '1.00x' : 'Jog Mode'}</span>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // MODE 4: BANK VAULT ROTARY SAFE
  // ----------------------------------------------------
  const dialNumber = Math.round(dialState.value) % 100;

  return (
    <div className="flex flex-col h-full bg-neutral-900/90 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden backdrop-blur-md">
      {/* Vault Unlocked Golden Backdrop Glow */}
      {safeUnlocked && (
        <div
          className="absolute inset-0 pointer-events-none animate-in fade-in duration-700"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(234, 179, 8, 0.25) 0%, transparent 75%)',
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 z-10">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border transition-colors ${
              safeUnlocked
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {safeUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm">Titanium Bank Vault Combination</h3>
            <p className="text-xs text-neutral-400 font-mono">3-Tumbler Mechanical Locking Core</p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetSafe}
          className="px-2.5 py-1 text-xs font-mono text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
        >
          Reset Dial
        </button>
      </div>

      {/* Main Safe Door Center */}
      <div className="flex-1 flex flex-col items-center justify-center my-2 z-10">
        {safeUnlocked ? (
          /* Vault Opened View */
          <div className="flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.5)] mb-3">
              <Sparkles className="w-10 h-10 text-amber-300 animate-pulse" />
            </div>
            <h4 className="text-lg font-bold font-mono text-amber-300">VAULT OPENED</h4>
            <p className="text-xs font-mono text-neutral-300 mt-1 max-w-xs">
              Mechanism disengaged. 24K Gold Reserve & Security Credentials retrieved!
            </p>
            <div className="mt-3 px-3 py-1 rounded bg-amber-950/60 border border-amber-600/40 text-[11px] font-mono text-amber-200">
              EEPROM Auth Token: 0x9F82A41C
            </div>
          </div>
        ) : (
          /* Dial Position & Tumbler Lights */
          <div className="flex flex-col items-center">
            {/* Dial Index Wheel */}
            <div className="w-32 h-32 rounded-full border-4 border-neutral-700 bg-neutral-950 flex flex-col items-center justify-center shadow-2xl relative">
              <div className="text-xs uppercase font-mono tracking-widest text-neutral-400">DIAL INDEX</div>
              <div className="text-3xl font-extrabold font-mono text-amber-300">
                {String(dialNumber).padStart(2, '0')}
              </div>
              <div className="text-[10px] font-mono text-neutral-400 mt-0.5">Scale: 0-99</div>
            </div>

            {/* Instruction feedback badge */}
            <div className="mt-3 px-3 py-1.5 rounded-lg bg-neutral-950/80 border border-amber-500/30 text-xs font-mono text-amber-300 font-semibold text-center">
              {safeFeedback}
            </div>
          </div>
        )}
      </div>

      {/* Tumbler Progress Indicators */}
      <div className="z-10 mt-auto">
        <div className="grid grid-cols-3 gap-2">
          {safeSteps.map((step, idx) => {
            const isCompleted = safeStepIdx > idx;
            const isCurrent = safeStepIdx === idx && !safeUnlocked;

            return (
              <div
                key={idx}
                className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all ${
                  isCompleted
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                    : 'bg-neutral-950/40 border-neutral-800 text-neutral-500'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] font-mono uppercase mb-0.5 font-bold">
                  {isCompleted ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : `TUMBLER ${idx + 1}`}
                </div>
                <div className="text-xs font-mono font-bold">
                  {step.direction.toUpperCase()} to {step.target}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
