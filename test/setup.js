// AsyncStorage talks to a native module that does not exist under Jest.
// The library ships an official in-memory mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The remote's Back key. Vega's BackHandler talks to the native input manager,
// which does not exist under Jest. The preset's own stand-in is a plain object,
// but the package index reads `.default` from the module, so it comes out as
// undefined. This stand-in has the right shape, records listeners and lets a
// test press Back. Both the platform-neutral and the .kepler file are mocked,
// because the index resolves the latter and test code may resolve the former.
const mockBackHandlerFactory = () => {
  const listeners = [];
  const BackHandler = {
    addEventListener: jest.fn((_name, handler) => {
      listeners.push(handler);
      return {
        remove: () => {
          const i = listeners.indexOf(handler);
          if (i >= 0) {
            listeners.splice(i, 1);
          }
        },
      };
    }),
    exitApp: jest.fn(),
    /** Simulates a press: true if a listener claimed it. */
    mockPressBack: () => {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i]()) {
          return true;
        }
      }
      BackHandler.exitApp();
      return false;
    },
  };
  return {__esModule: true, default: BackHandler};
};
jest.mock('@amazon-devices/react-native-kepler/Libraries/Utilities/BackHandler', () =>
  mockBackHandlerFactory(),
);
jest.mock('@amazon-devices/react-native-kepler/Libraries/Utilities/BackHandler.kepler', () =>
  mockBackHandlerFactory(),
);
