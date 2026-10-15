import {AudioPlayer as MockPlayer} from '@amazon-devices/react-native-w3cmedia';

import {createVegaAudioPlayer} from '../src/services/vegaAudio';

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

describe('createVegaAudioPlayer', () => {
  it('initialises the platform player once and plays through it', async () => {
    const instances = (MockPlayer as unknown as {instances: unknown[]}).instances;
    const before = instances.length;
    const player = createVegaAudioPlayer();
    expect(player).not.toBeNull();
    const handlers = {onTime: jest.fn(), onEnded: jest.fn(), onError: jest.fn()};
    player!.play('https://x/line-0.mp3', handlers);
    await settle();
    const created = instances.slice(before) as Array<{
      initialized: boolean;
      src: string;
      playing: boolean;
      fire: (t: string) => void;
    }>;
    expect(created).toHaveLength(1);
    expect(created[0].initialized).toBe(true);
    expect(created[0].src).toBe('https://x/line-0.mp3');
    expect(created[0].playing).toBe(true);
    created[0].fire('ended');
    expect(handlers.onEnded).toHaveBeenCalled();
    player!.play('https://x/line-1.mp3', handlers);
    await settle();
    expect(instances.slice(before)).toHaveLength(1);
    player!.stop();
  });
});
