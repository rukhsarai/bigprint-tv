/**
 * Stand-in for @amazon-devices/react-native-w3cmedia under Jest. The real
 * package talks to native turbo modules that do not exist in a test runner.
 * Only the surface the app uses is modelled.
 */
class AudioPlayer {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.listeners = {};
    this.initialized = false;
    AudioPlayer.instances.push(this);
  }
  initialize() {
    this.initialized = true;
    return Promise.resolve();
  }
  deinitialize() {
    return Promise.resolve();
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  removeEventListener(type) {
    delete this.listeners[type];
  }
  load() {}
  play() {
    this.playing = true;
    return Promise.resolve();
  }
  pause() {
    this.playing = false;
  }
  fire(type) {
    if (this.listeners[type]) {
      this.listeners[type]();
    }
  }
}
AudioPlayer.instances = [];

module.exports = {
  AudioPlayer,
  AudioContentType: {CONTENT_TYPE_SPEECH: 1},
  AudioUsageType: {USAGE_MEDIA: 1},
};
