import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  COLOURS,
  DEFAULT_COLOURS,
  isColoursName,
  nextColours,
  type Colours,
  type ColoursName,
} from './colours';

const COLOURS_KEY = 'bigprint.colours';

export type ColoursState = {
  name: ColoursName;
  colours: Colours;
  /** True once the saved choice has been read. */
  restored: boolean;
  /** False until the viewer has picked a look, so first run can ask. */
  chosen: boolean;
  /** Pick a look and remember it. */
  choose: (name: ColoursName) => void;
  /** Move to the next look, as the Colours button does, and remember it. */
  cycle: () => void;
};

// Outside a provider (a screen rendered on its own in a test) the app shows
// the default look and the controls do nothing.
const ColoursContext = createContext<ColoursState>({
  name: DEFAULT_COLOURS,
  colours: COLOURS[DEFAULT_COLOURS],
  restored: true,
  chosen: true,
  choose: () => {},
  cycle: () => {},
});

const save = (name: ColoursName) =>
  AsyncStorage.setItem(COLOURS_KEY, name).catch((e) =>
    console.warn('Could not save colours', e),
  );

/**
 * Holds the viewer's look for the whole app, so switching it on one screen
 * shows on the next without a second read, and remembers it between launches
 * like the text size.
 */
export const ColoursProvider = ({children}: {children: React.ReactNode}) => {
  const [name, setName] = useState<ColoursName>(DEFAULT_COLOURS);
  const [restored, setRestored] = useState(false);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(COLOURS_KEY);
        if (active && isColoursName(saved)) {
          setName(saved);
          setChosen(true);
        }
      } catch (e) {
        console.warn('Could not read saved colours', e);
      } finally {
        if (active) {
          setRestored(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const choose = useCallback((next: ColoursName) => {
    setName(next);
    setChosen(true);
    save(next);
  }, []);

  const cycle = useCallback(() => {
    setName((current) => {
      const next = nextColours(current);
      save(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({name, colours: COLOURS[name], restored, chosen, choose, cycle}),
    [name, restored, chosen, choose, cycle],
  );

  return (
    <ColoursContext.Provider value={value}>{children}</ColoursContext.Provider>
  );
};

export const useColours = (): ColoursState => useContext(ColoursContext);
