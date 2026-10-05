/** Longest voice note the platform accepts; recording stops itself here. */
export const MAX_VOICE_NOTE_SECONDS = 60;
/** Largest clip the platform accepts (conversation-api's MaxVoiceNoteBytes). */
export const MAX_VOICE_NOTE_BYTES = 2 * 1024 * 1024;
// Plenty for speech, and keeps a full minute well under MAX_VOICE_NOTE_BYTES in every format.
const RECORDING_BITS_PER_SECOND = 48_000;

// Preferred first. Chromium and Firefox record WebM/Ogg Opus, Safari records MP4/AAC; the server
// identifies the clip by its bytes, so any of these is accepted.
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function canRecordInBrowser(): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

export function canSpeakInBrowser(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function pickRecordingType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function fileExtension(mimeType: string): string {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/m4a') return 'm4a';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  return 'webm';
}

/** Why a recording could not start. 'denied' means the visitor (or the page) blocked the mic. */
export type RecordingStartError = 'denied' | 'unavailable';

/**
 * One microphone recording. The stream is released as soon as recording stops or is cancelled,
 * so the browser's "using your microphone" indicator never outlives the voice note.
 */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private cancelled = false;
  private finished: Promise<Blob | null> | null = null;

  async start(): Promise<RecordingStartError | null> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? '';
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
    }
    const mimeType = pickRecordingType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: RECORDING_BITS_PER_SECOND }
        : { audioBitsPerSecond: RECORDING_BITS_PER_SECOND });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return 'unavailable';
    }
    this.stream = stream;
    this.recorder = recorder;
    this.chunks = [];
    this.cancelled = false;
    this.finished = new Promise((resolve) => {
      recorder.addEventListener('dataavailable', (e: BlobEvent) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      });
      recorder.addEventListener('stop', () => {
        this.release();
        if (this.cancelled || this.chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(new Blob(this.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
      });
    });
    recorder.start();
    return null;
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** Stops and returns the clip, or null when nothing was captured. */
  stop(): Promise<Blob | null> {
    if (!this.recorder || !this.finished) return Promise.resolve(null);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.finished;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    } else {
      this.release();
    }
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/**
 * Reply text as it should be heard: markdown syntax, code and bare links removed, link labels kept.
 * Nothing language-specific, so it works the same for every language the assistant answers in.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits text into pieces short enough for every speech engine. Chromium stops a single long
 * utterance after about 15 seconds, so long replies are queued sentence by sentence. Sentence ends
 * are recognised by Unicode punctuation, which covers Latin, Arabic and CJK scripts alike.
 */
export function speechChunks(text: string, maxLength = 200): string[] {
  const sentences = text.match(/[^.!?؟。！？\n]+[.!?؟。！？]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLength) {
      current += sentence;
      continue;
    }
    if (current.trim()) chunks.push(current.trim());
    if (sentence.length <= maxLength) {
      current = sentence;
      continue;
    }
    // A single sentence longer than the limit: break it at word boundaries.
    current = '';
    for (const word of sentence.split(/(\s+)/)) {
      if ((current + word).length > maxLength && current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      current += word;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** The installed voice that best fits the language, or null to let the browser choose. */
export function pickVoice(voices: SpeechSynthesisVoice[], language: string): SpeechSynthesisVoice | null {
  const wanted = language.toLowerCase();
  const base = wanted.split('-')[0];
  const matches = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
  return matches.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted && v.localService)
    ?? matches.find((v) => v.localService)
    ?? matches[0]
    ?? null;
}

interface LanguageDetection {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorInstance {
  detect(text: string): Promise<LanguageDetection[]>;
}

interface LanguageDetectorApi {
  availability?(): Promise<string>;
  create(): Promise<LanguageDetectorInstance>;
}

let detector: Promise<LanguageDetectorInstance | null> | null = null;

/**
 * The language a reply is written in, so it is read with a voice for that language even when it
 * differs from the page's (an Arabic answer on an English site). Uses the browser's built-in
 * on-device language detector where there is one and its model is already installed; never
 * triggers a model download. Anywhere else, or when unsure, it returns the fallback.
 */
export async function detectLanguage(text: string, fallback: string): Promise<string> {
  const api = (globalThis as { LanguageDetector?: LanguageDetectorApi }).LanguageDetector;
  if (!api || typeof api.create !== 'function') return fallback;
  try {
    detector ??= (async () => {
      const availability = typeof api.availability === 'function' ? await api.availability() : 'available';
      return availability === 'available' ? api.create() : null;
    })().catch(() => null);
    const instance = await detector;
    if (!instance) return fallback;
    const [best] = await instance.detect(text.slice(0, 1000));
    return best && best.confidence >= 0.6 && best.detectedLanguage !== 'und' ? best.detectedLanguage : fallback;
  } catch {
    return fallback;
  }
}

/** Test hook: forget the cached detector. */
export function resetLanguageDetector(): void {
  detector = null;
}

/** Reads replies aloud with the device's own speech engine. Free, offline, never leaves the device. */
export class BrowserSpeaker {
  private generation = 0;

  speak(text: string, language: string, onDone: () => void): void {
    this.stop();
    const synth = window.speechSynthesis;
    const chunks = speechChunks(text);
    if (chunks.length === 0) {
      onDone();
      return;
    }
    const generation = ++this.generation;
    const voice = pickVoice(synth.getVoices(), language);
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = voice?.lang ?? language;
      if (voice) utterance.voice = voice;
      if (i === chunks.length - 1) {
        const finish = () => {
          if (generation === this.generation) onDone();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
      }
      synth.speak(utterance);
    });
  }

  stop(): void {
    this.generation++;
    if (canSpeakInBrowser()) window.speechSynthesis.cancel();
  }
}
