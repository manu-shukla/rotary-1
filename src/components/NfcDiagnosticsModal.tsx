/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Cpu,
  Radio,
  FileCode,
  Smartphone,
  CheckCircle,
  Copy,
  ExternalLink,
  Volume2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { NtagDialState, generateNtag215Memory, formatHexDump } from '../lib/sensorFusion';
import { nfcService } from '../lib/nfcService';
import { audioHaptics, SoundProfile } from '../lib/audioHaptics';

interface NfcDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dialState: NtagDialState;
  onUpdateStepDeg: (stepDeg: number) => void;
}

export const NfcDiagnosticsModal: React.FC<NfcDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  dialState,
  onUpdateStepDeg,
}) => {
  const [activeTab, setActiveTab] = useState<'eeprom' | 'hardware' | 'sound'>('eeprom');
  const [writeFeedback, setWriteFeedback] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  if (!isOpen) return null;

  const memoryBytes = generateNtag215Memory(dialState);
  const hexRows = formatHexDump(memoryBytes, 0, 16); // first 16 pages (64 bytes)
  const soundProfiles: Array<{ id: SoundProfile; name: string; desc: string }> = [
    { id: 'audiophile', name: 'Audiophile Brass Detent', desc: 'Machined heavy solid brass dial with damped 820Hz knock' },
    { id: 'watchmaker', name: 'Swiss Watchmaker Ratchet', desc: 'High-frequency 3.6kHz spring-loaded pawl escapement' },
    { id: 'vault', name: 'Bank Vault Tumbler Dial', desc: 'Heavy steel cast-iron dial with dual reverberant metallic clicks' },
    { id: 'stepper', name: 'Industrial Stepper Motor', desc: 'Crisp snappy electromagnetic detent pulses' },
  ];

  const handlePhysicalTagWrite = async () => {
    setIsWriting(true);
    setWriteFeedback('Hold physical NTAG215 against the back of your phone...');
    try {
      const res = await nfcService.writeToPhysicalTag(dialState);
      setWriteFeedback(res.message);
      audioHaptics.playNfcDisconnectAndWriteSound();
    } catch (err: any) {
      setWriteFeedback(`Write failed: ${err?.message || 'Tag disconnected'}`);
    } finally {
      setIsWriting(false);
    }
  };

  const copyAppUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-neutral-100 tracking-wide font-mono">
                NTAG215 EEPROM &amp; SENSOR FUSION LAB
              </h2>
              <p className="text-xs text-neutral-400 font-mono">
                UID: {dialState.tagUid} · 13.56 MHz ISO 14443-3A
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('eeprom')}
            className={`py-3 px-4 text-xs font-mono font-medium border-b-2 transition-colors ${
              activeTab === 'eeprom'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            EEPROM Hex Memory (504B)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`py-3 px-4 text-xs font-mono font-medium border-b-2 transition-colors ${
              activeTab === 'hardware'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Web NFC &amp; Mobile Setup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`py-3 px-4 text-xs font-mono font-medium border-b-2 transition-colors ${
              activeTab === 'sound'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Haptics &amp; Mechanical Sound
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs">
          {/* TAB 1: EEPROM HEX DUMP */}
          {activeTab === 'eeprom' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300 leading-relaxed text-[11px]">
                <span className="text-amber-400 font-bold">NTAG215 Architecture:</span> 540 total bytes split into 135
                pages of 4 bytes each. Pages 0–2 contain the factory NXP 7-byte UID. Page 3 is the Capability Container
                (0xE1 0x10 0x6D 0x00). User memory starts at Page 4 containing the NDEF text record.
              </div>

              {/* Hex Table */}
              <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                <div className="grid grid-cols-12 bg-neutral-900/80 px-3 py-2 text-[10px] uppercase font-bold text-neutral-400 border-b border-neutral-800">
                  <div className="col-span-2">Page</div>
                  <div className="col-span-4">Hex Bytes (4B)</div>
                  <div className="col-span-2">ASCII</div>
                  <div className="col-span-4 text-right">Section</div>
                </div>
                <div className="divide-y divide-neutral-900 max-h-60 overflow-y-auto">
                  {hexRows.map((row) => (
                    <div
                      key={row.page}
                      className="grid grid-cols-12 px-3 py-1.5 hover:bg-neutral-900/50 transition-colors text-[11px]"
                    >
                      <div className="col-span-2 text-neutral-400">
                        0x{row.page.toString(16).padStart(2, '0').toUpperCase()} ({row.page})
                      </div>
                      <div className="col-span-4 text-amber-300 font-bold">{row.hex}</div>
                      <div className="col-span-2 text-neutral-300">{row.ascii}</div>
                      <div className="col-span-4 text-right text-neutral-400 text-[10px]">{row.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Payload Preview */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                <div className="text-[10px] uppercase text-neutral-400 mb-1">
                  Decoded NDEF Record (Committed on Phone Lift-off)
                </div>
                <div className="text-neutral-200 text-[11px] bg-neutral-900 p-2 rounded border border-neutral-800 break-all font-mono">
                  {JSON.stringify({
                    app: 'tap-twist',
                    id: dialState.tagUid,
                    mode: dialState.mode,
                    val: dialState.value,
                    step: dialState.stepDeg,
                    unit: dialState.unit,
                    ts: dialState.updatedAt,
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HARDWARE & MOBILE */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <h4 className="font-bold text-neutral-100 text-sm mb-2 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-amber-400" />
                  Physical NTAG215 Hardware Writer
                </h4>
                <p className="text-neutral-300 text-[11px] mb-3 leading-relaxed">
                  You can stick a standard $0.50 NTAG215 sticker under a wooden drink coaster or on your wall.
                  Using Chrome on Android with Web NFC, clicking below writes the exact initial configuration onto the tag.
                </p>

                <button
                  type="button"
                  onClick={handlePhysicalTagWrite}
                  disabled={isWriting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-xs transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  {isWriting ? 'Writing to Tag...' : 'Flash Dial Position to Physical Tag'}
                </button>

                {writeFeedback && (
                  <div className="mt-3 p-2.5 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 text-[11px]">
                    {writeFeedback}
                  </div>
                )}
              </div>

              {/* Mobile device connection */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <h4 className="font-bold text-neutral-100 text-sm mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  Run on your Phone
                </h4>
                <p className="text-neutral-300 text-[11px] mb-3 leading-relaxed">
                  Open this application in Chrome on Android or Safari on iOS. The app will access the physical
                  hardware gyroscope sensor (`deviceorientation`) and vibration engine (`navigator.vibrate`) for
                  true tactile detents as you twist the phone!
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyAppUrl}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs transition-colors"
                  >
                    {copiedUrl ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copiedUrl ? 'URL Copied!' : 'Copy Mobile URL'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HAPTICS & SOUND */}
          {activeTab === 'sound' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-neutral-100 text-sm mb-2 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  Synthesized Mechanical Click Profiles
                </h4>
                <p className="text-neutral-300 text-[11px] mb-3">
                  Choose the mechanical acoustic resonance profile for detent ticks:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {soundProfiles.map((p) => {
                    const isSelected = audioHaptics.getProfile() === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          audioHaptics.setProfile(p.id);
                          audioHaptics.playDetentTick('cw', 1.2);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                        }`}
                      >
                        <div className="font-bold text-xs text-neutral-100 mb-0.5">{p.name}</div>
                        <div className="text-[10px] text-neutral-400">{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detent Sensitivity Stepper */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-neutral-100 text-xs">Mechanical Detent Step Angle:</span>
                  <span className="text-amber-400 font-bold">{dialState.stepDeg}° per tick</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 5, 10, 15].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => onUpdateStepDeg(deg)}
                      className={`py-2 rounded-lg border text-center transition-colors font-mono text-xs ${
                        dialState.stepDeg === deg
                          ? 'bg-amber-500 text-neutral-950 font-bold border-amber-400'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      {deg}° / Tick
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
