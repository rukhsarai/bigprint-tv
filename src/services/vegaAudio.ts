import {
  type AudioPlayer,
  type MediaElementLike,
  createMediaElementPlayer,
} from './audioPlayer';

/**
 * Audio on Vega OS comes from Amazon's W3C media package. Its AudioPlayer is
 * a plain class (not a component) that implements HTMLMediaElement, so the
 * generic wrapper can drive it. It must be initialised before use, which the
 * wrapper does once and reuses.
 *
 * The package is required lazily, inside try/catch, because it registers its
 * native turbo module at import time: a static import would crash the whole
 * app at startup on a build without the module, before any guard could run.
 * Metro bundles a require inside try/catch as optional, so the build is fine
 * either way, and the app simply falls back to the silent highlight.
 */
export const createVegaAudioPlayer = (): AudioPlayer | null => {
  let media: {
    AudioPlayer?: new (audioType?: number, audioUsage?: number) => unknown;
    AudioContentType?: {CONTENT_TYPE_SPEECH: number};
    AudioUsageType?: {USAGE_MEDIA: number};
  };
  try {
    media = require('@amazon-devices/react-native-w3cmedia');
  } catch {
    return null;
  }
  const VegaAudioPlayer = media.AudioPlayer;
  if (typeof VegaAudioPlayer !== 'function') {
    return null;
  }
  return createMediaElementPlayer(async () => {
    // Speech, not music: lets the platform treat it like a voice prompt.
    const player = new VegaAudioPlayer(
      media.AudioContentType?.CONTENT_TYPE_SPEECH,
      media.AudioUsageType?.USAGE_MEDIA,
    ) as {initialize: () => Promise<void>};
    await player.initialize();
    return player as unknown as MediaElementLike;
  });
};
