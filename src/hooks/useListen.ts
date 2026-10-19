import {useCallback, useEffect, useRef, useState} from 'react';

import type {ScannedDocument} from '../data/documents';
import type {AudioPlayer} from '../services/audioPlayer';
import type {DocumentService, Unsubscribe} from '../services/documentService';

/**
 * - idle: not playing; Listen starts from the top.
 * - preparing: the voice is being made, which happens on the first Listen.
 * - playing / paused: the letter is being read aloud, or held.
 * - unavailable: the voice could not be made, or could not be played.
 */
export type ListenState =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'unavailable';

export type Listen = {
  state: ListenState;
  /** Listen, pause, carry on: the one button does whichever comes next. */
  press: () => void;
  stop: () => void;
};

/**
 * The letter read aloud as one story, start to finish, for someone who would
 * rather listen than read. Nothing on screen follows the voice: the text is
 * for reading and the voice is for listening, and neither waits on the other.
 *
 * The voice is made only on the first Listen, so a letter nobody listens to
 * costs nothing to voice. Once made it is kept, so listening again is free.
 */
export const useListen = (
  player: AudioPlayer | null,
  service: DocumentService,
  document: ScannedDocument,
): Listen => {
  const [state, setState] = useState<ListenState>('idle');
  const urls = useRef<string[] | null>(null);
  const request = useRef<Unsubscribe | null>(null);
  // Bumped by stop, so a late callback from earlier playback is ignored.
  const run = useRef(0);

  const playPart = useCallback(
    (index: number) => {
      const list = urls.current;
      if (!player || !list || index >= list.length) {
        setState('idle');
        return;
      }
      const mine = run.current;
      setState('playing');
      player.play(list[index], {
        onEnded: () => {
          if (mine === run.current) {
            // The next part follows on; after the last, back to the top.
            playPart(index + 1);
          }
        },
        onError: () => {
          if (mine === run.current) {
            setState('unavailable');
          }
        },
        // Alexa took the speaker: stop, rather than carry on to the next part.
        onInterrupted: () => {
          if (mine === run.current) {
            setState('idle');
          }
        },
      });
    },
    [player],
  );

  const stop = useCallback(() => {
    run.current += 1;
    request.current?.();
    request.current = null;
    player?.stop();
    setState((current) => (current === 'unavailable' ? current : 'idle'));
  }, [player]);

  const press = useCallback(() => {
    if (!player) {
      return;
    }
    switch (state) {
      case 'playing':
        player.pause();
        setState('paused');
        return;
      case 'paused':
        player.resume();
        setState('playing');
        return;
      case 'preparing':
        // Pressed again while waiting: the viewer has changed their mind.
        stop();
        return;
      case 'unavailable':
        return;
    }
    if (urls.current) {
      playPart(0);
      return;
    }
    setState('preparing');
    const mine = run.current;
    request.current = service.requestVoice(document, (update) => {
      if (mine !== run.current) {
        return;
      }
      if (update.state === 'ready') {
        request.current = null;
        urls.current = update.urls;
        playPart(0);
      } else if (update.state === 'none') {
        request.current = null;
        setState('unavailable');
      }
    });
  }, [player, state, service, document, playPart, stop]);

  // Never leave audio or a request running after the screen goes away.
  useEffect(
    () => () => {
      run.current += 1;
      request.current?.();
      player?.stop();
    },
    [player],
  );

  return {state, press, stop};
};
