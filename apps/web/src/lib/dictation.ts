'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice dictation for the assistant's text box.
 *
 * This is dictation, not a voice agent: speech becomes text in the same field
 * the user could have typed into, and the assistant pipeline downstream is
 * identical either way. Nothing is sent anywhere until the user submits, and
 * nothing is written until they confirm the proposal.
 *
 * Recognition runs on-device via the browser's speech engine where one exists.
 * Where it doesn't (Firefox today) `supported` is false and the caller simply
 * doesn't render a microphone — typing is always the full-featured path.
 */

type SpeechAlternative = { transcript: string };
type SpeechResult = { 0: SpeechAlternative; isFinal: boolean; length: number };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
type SpeechRecognitionEventLike = { resultIndex: number; results: SpeechResultList };
type SpeechRecognitionErrorLike = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in your browser settings.',
  'no-speech': "Didn't catch that. Try again, a little closer to the microphone.",
  'audio-capture': 'No microphone was found.',
};

export type Dictation = {
  /** False when the browser has no speech engine — render no microphone at all. */
  supported: boolean;
  listening: boolean;
  error: string;
  start: () => void;
  stop: () => void;
};

/**
 * @param onTranscript receives the full text for the current dictation session
 *   on every update, interim results included, so the field fills in as the
 *   person speaks rather than in one lump at the end.
 */
export function useDictation(onTranscript: (transcript: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Held in a ref so restarting recognition doesn't re-subscribe on every
  // keystroke in the parent.
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  useEffect(() => {
    setSupported(recognitionConstructor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    recognition.current?.abort();
    const instance = new Recognition();
    // Continuous + interim: a stock count is a long, pausing sentence, and the
    // speaker should see the words land as they say them.
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || 'en-US';
    instance.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? '';
      }
      callback.current(transcript.trim());
    };
    instance.onerror = (event) => {
      // "aborted" is what a deliberate stop looks like; it is not an error.
      if (event.error !== 'aborted') {
        setError(MESSAGES[event.error] ?? 'Dictation stopped unexpectedly.');
      }
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setError('');
    try {
      instance.start();
      setListening(true);
    } catch {
      setError('Dictation could not start.');
      setListening(false);
    }
  }, []);

  return { supported, listening, error, start, stop };
}
