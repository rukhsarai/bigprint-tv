import {act, renderHook, waitFor} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {useTextScale} from '../src/hooks/useTextScale';

describe('useTextScale', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('typeAt pairs every font size with a scaled line height', async () => {
    const {result} = renderHook(() => useTextScale());
    await waitFor(() => expect(result.current.restored).toBe(true));

    expect(result.current.typeAt(24)).toEqual({fontSize: 24, lineHeight: 34});
    expect(result.current.typeAt(40)).toEqual({fontSize: 40, lineHeight: 56});

    act(() => result.current.changeScale(1));
    expect(result.current.scale).toBe(1.25);
    expect(result.current.typeAt(24)).toEqual({fontSize: 30, lineHeight: 42});
    expect(result.current.typeAt(24).fontSize).toBe(result.current.scaled(24));
  });
});
