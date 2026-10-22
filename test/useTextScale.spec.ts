import {act, renderHook, waitFor} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {useTextScale} from '../src/hooks/useTextScale';
import {typeFor} from '../src/theme/layout';

describe('useTextScale', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('scales base sizes by the chosen step', async () => {
    const {result} = renderHook(() => useTextScale());
    await waitFor(() => expect(result.current.restored).toBe(true));
    // Starts at 1.5x: large print is the product, 1x is for people who do
    // not need it.
    expect(result.current.scale).toBe(1.5);
    expect(result.current.scaled(24)).toBe(36);

    act(() => result.current.changeScale(1));
    expect(result.current.scale).toBe(2);
    expect(result.current.scaled(24)).toBe(48);
  });
});

describe('typeFor', () => {
  it('pairs every font size with a line height, so wrapped text is not clipped', () => {
    expect(typeFor(24, 1)).toEqual({fontSize: 24, lineHeight: 34});
    expect(typeFor(40, 1)).toEqual({fontSize: 40, lineHeight: 56});
  });

  it('follows the design scale, so a 960-wide window gets half-size type', () => {
    expect(typeFor(30, 0.5)).toEqual({fontSize: 15, lineHeight: 21});
  });

  it('never returns a zero font size', () => {
    expect(typeFor(1, 0.1).fontSize).toBe(1);
  });
});
