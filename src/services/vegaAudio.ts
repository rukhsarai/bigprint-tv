import {
  AudioContentType,
  AudioPlayer as VegaAudioPlayer,
  AudioUsageType,
} from '@amazon-devices/react-native-w3cmedia';

import {type AudioPlayer, createMediaElementPlayer} from './audioPlayer';

/**
 * Audio on Vega OS comes from Amazon's W3C media package. Its AudioPlayer is
 * a plain class (not a component) that implements HTMLMediaElement, so the
 * generic wrapper can drive it. It must be initialised before use, which the
 * wrapper does once and reuses.
 */
export const createVegaAudioPlayer = (): AudioPlayer | null => {
  if (typeof VegaAudioPlayer !== 'function') {
    return null;
  }
  return createMediaElementPlayer(async () => {
    // Speech, not music: lets the platform treat it like a voice prompt.
    const player = new VegaAudioPlayer(
      AudioContentType.CONTENT_TYPE_SPEECH,
      AudioUsageType.USAGE_MEDIA,
    );
    await player.initialize();
    return player;
  });
};
