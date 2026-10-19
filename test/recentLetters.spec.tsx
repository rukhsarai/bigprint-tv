import * as React from 'react';
import {act, fireEvent, render, renderHook, screen, waitFor} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MAX_RECENT,
  letterTitle,
  useRecentLetters,
  whenSeen,
} from '../src/hooks/useRecentLetters';
import {RecentLetters} from '../src/screens/RecentLetters';
import {sampleReceipt, sampleInvoice} from '../src/data/documents';

const DAY = 24 * 60 * 60 * 1000;

describe('useRecentLetters', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps letters on the TV, newest first, once each', async () => {
    const {result} = renderHook(() => useRecentLetters());
    await act(async () => {});
    act(() => result.current.remember(sampleReceipt));
    act(() => result.current.remember(sampleInvoice));
    act(() => result.current.remember(sampleReceipt));
    expect(result.current.letters.map((l) => l.document.id)).toEqual([
      sampleReceipt.id,
      sampleInvoice.id,
    ]);
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem('bigprint.recent'))!)).toHaveLength(2),
    );
  });

  it('keeps at most ten', async () => {
    const {result} = renderHook(() => useRecentLetters());
    await act(async () => {});
    for (let i = 0; i < 12; i++) {
      act(() => result.current.remember({...sampleReceipt, id: `doc-${i}`}));
    }
    expect(result.current.letters).toHaveLength(MAX_RECENT);
    expect(result.current.letters[0].document.id).toBe('doc-11');
  });

  it('forgets letters older than a day, and anything malformed', async () => {
    const now = Date.now();
    await AsyncStorage.setItem(
      'bigprint.recent',
      JSON.stringify([
        {document: sampleReceipt, seenAt: now - 2 * 60 * 60 * 1000},
        {document: sampleInvoice, seenAt: now - 2 * DAY},
        {document: {id: 'x'}, seenAt: now},
        'nonsense',
      ]),
    );
    const {result} = renderHook(() => useRecentLetters());
    await waitFor(() => expect(result.current.letters).toHaveLength(1));
    expect(result.current.letters[0].document.id).toBe(sampleReceipt.id);
  });

  it('drops a letter once its day is up, even with the app left open', async () => {
    let clock = Date.now();
    const {result, rerender} = renderHook(() => useRecentLetters(() => clock));
    await act(async () => {});
    act(() => result.current.remember(sampleReceipt));
    expect(result.current.letters).toHaveLength(1);
    clock += DAY + 1000;
    rerender({});
    expect(result.current.letters).toHaveLength(0);
  });

  it('deletes them all from the TV', async () => {
    const {result} = renderHook(() => useRecentLetters());
    await act(async () => {});
    act(() => result.current.remember(sampleReceipt));
    act(() => result.current.clear());
    expect(result.current.letters).toHaveLength(0);
    await waitFor(async () => expect(await AsyncStorage.getItem('bigprint.recent')).toBeNull());
  });

  it('names a letter and says when it was read', () => {
    expect(letterTitle({...sampleReceipt, sender: 'Severn Water', kind: 'Bill'})).toBe(
      'Bill from Severn Water',
    );
    expect(letterTitle({...sampleReceipt, sender: undefined, kind: 'Card'})).toBe('Card');
    const now = new Date(2026, 9, 19, 15, 0).getTime();
    expect(whenSeen(new Date(2026, 9, 19, 10, 42).getTime(), now)).toBe('Today 10:42');
    expect(whenSeen(new Date(2026, 9, 18, 18, 5).getTime(), now)).toBe('Yesterday 18:05');
    expect(whenSeen(new Date(2026, 9, 14, 9, 30).getTime(), now)).toBe('Wed 09:30');
  });
});

describe('RecentLetters screen', () => {
  const letters = [
    {document: {...sampleReceipt, kind: 'Bill', sender: 'Severn Water'}, seenAt: Date.now()},
    {document: sampleInvoice, seenAt: Date.now() - DAY},
  ];

  it('opens a letter with one press', () => {
    const onOpen = jest.fn();
    render(
      <RecentLetters letters={letters} onOpen={onOpen} onClose={jest.fn()} onDeleteAll={jest.fn()} />,
    );
    expect(screen.getByText(/Bill from Severn Water/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('recent-0'));
    expect(onOpen).toHaveBeenCalledWith(letters[0].document);
  });

  it('asks once before deleting them all', () => {
    const onDeleteAll = jest.fn();
    render(
      <RecentLetters letters={letters} onOpen={jest.fn()} onClose={jest.fn()} onDeleteAll={onDeleteAll} />,
    );
    fireEvent.press(screen.getByTestId('control-Delete all'));
    expect(onDeleteAll).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('control-Keep'));
    fireEvent.press(screen.getByTestId('control-Delete all'));
    fireEvent.press(screen.getByTestId('control-Confirm delete'));
    expect(onDeleteAll).toHaveBeenCalledTimes(1);
  });
});
