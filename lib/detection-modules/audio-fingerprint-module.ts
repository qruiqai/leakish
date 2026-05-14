import { DETECT_TIMEOUTS } from './constants';
import type { DetectionModule, DetectionResult } from './types';

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export interface AudioFingerprintData {
  audioContextFingerprint: string;
  sampleRate: number;
  maxChannelCount: number;
  numberOfInputs: number;
  numberOfOutputs: number;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
  state: string;
  baseLatency?: number;
  outputLatency?: number;
}

async function detectAudioFingerprint(): Promise<AudioFingerprintData> {
  return new Promise((resolve, reject) => {
    const windowWithAudio = window as WindowWithWebkitAudioContext;
    const AudioCtor = window.AudioContext ?? windowWithAudio.webkitAudioContext;
    if (!AudioCtor) {
      reject(new Error('AudioContext not supported'));
      return;
    }

    const audioContext = new AudioCtor();
    const oscillator = audioContext.createOscillator();
    const analyser = audioContext.createAnalyser();
    const gainNode = audioContext.createGain();
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    let settled = false;

    const cleanup = () => {
      try {
        scriptProcessor.onaudioprocess = null;
        oscillator.disconnect();
        scriptProcessor.disconnect();
        analyser.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(() => {
          // ignore
        });
      }
    };

    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      run();
    };

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);

    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(audioContext.destination);

    scriptProcessor.onaudioprocess = bins => {
      const samples = bins.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 4500; i < 5000; i++) {
        sum += Math.abs(samples[i]);
      }
      const fingerprint = sum.toString();

      const snapshot: AudioFingerprintData = {
        audioContextFingerprint: fingerprint,
        sampleRate: audioContext.sampleRate,
        maxChannelCount: audioContext.destination.maxChannelCount,
        numberOfInputs: audioContext.destination.numberOfInputs,
        numberOfOutputs: audioContext.destination.numberOfOutputs,
        channelCount: audioContext.destination.channelCount,
        channelCountMode: audioContext.destination.channelCountMode,
        channelInterpretation: audioContext.destination.channelInterpretation,
        state: audioContext.state,
        baseLatency: audioContext.baseLatency,
        outputLatency: audioContext.outputLatency,
      };

      settle(() => resolve(snapshot));
    };

    try {
      oscillator.start(0);
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error('Audio fingerprint detection timeout')));
    }, DETECT_TIMEOUTS.audioMs);
  });
}

export const audioFingerprintModule: DetectionModule<AudioFingerprintData> = {
  id: 'audio-fingerprint',
  name: 'Audio fingerprint',
  description: 'Fingerprint derived from AudioContext rendering characteristics',
  category: 'browser',
  icon: 'Volume2',
  enabled: true,
  detect: async (): Promise<DetectionResult<AudioFingerprintData>> => {
    try {
      const data = await detectAudioFingerprint();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          fingerprintLength: data.audioContextFingerprint.length,
          hasBaseLatency: data.baseLatency !== undefined,
          hasOutputLatency: data.outputLatency !== undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Audio fingerprint detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
