import 'react-native';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {DocumentView} from '../src/screens/DocumentView';
import {sampleReceipt as mockBill} from '../src/data/documents';

/** Waits for the saved-text-size lookup to finish so React state is settled. */
const settled = () =>
  waitFor(() => expect(screen.getByText(/Text size/)).toBeTruthy());

describe('DocumentView', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows what kind of letter it is and who sent it', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.getByText(mockBill.kind)).toBeTruthy();
    expect(screen.getByText(`from ${mockBill.sender}`)).toBeTruthy();
  });

  it('shows every key fact, which must never be hidden', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    for (const fact of mockBill.keyFacts) {
      expect(screen.getByText(fact.label)).toBeTruthy();
      expect(screen.getByText(fact.value)).toBeTruthy();
    }
  });

  it('renders every line of the letter', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    mockBill.lines.forEach((_, index) => {
      expect(screen.getByTestId(`line-${index}`)).toBeTruthy();
    });
  });

  it('calls back when Back is pressed', async () => {
    const onBack = jest.fn();
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={onBack} />);
    await settled();
    fireEvent.press(screen.getByTestId('control-Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('persists a larger text size for the next screen', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    fireEvent.press(screen.getByTestId('control-Bigger text'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bigprint.textScale')).toBe('1.25'),
    );
  });

  it('warns when the backend was unsure about the text', async () => {
    render(
      <DocumentView
        document={{...mockBill, lowConfidence: true}}
        player={null}
        audioUrl={() => null}
        onBack={() => {}}
      />,
    );
    await settled();
    expect(
      screen.getByText(
        'Some words were hard to read. Please check against the paper copy.',
      ),
    ).toBeTruthy();
  });

  it('links key facts to the first line so a screen reader hears them', async () => {
    // Fire TV screen readers follow input focus, so static text is never
    // reached on its own. Losing this link silently hides the amount due.
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    const firstLine = screen.getByTestId('line-0');
    expect(firstLine.props.accessibilityDescribedBy).toEqual(
      mockBill.keyFacts.map((_, index) => `fact-${index}`),
    );
  });

  it('also links the warning when confidence is low', async () => {
    render(
      <DocumentView
        document={{...mockBill, lowConfidence: true}}
        player={null}
        audioUrl={() => null}
        onBack={() => {}}
      />,
    );
    await settled();
    expect(
      screen.getByTestId('line-0').props.accessibilityDescribedBy,
    ).toContain('read-warning');
  });

  it('marks lines as buttons, since pressing them reads aloud', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.getByTestId('line-0').props.role).toBe('button');
  });

  it('does not warn when confidence is good', async () => {
    render(<DocumentView document={mockBill} player={null} audioUrl={() => null} onBack={() => {}} />);
    await settled();
    expect(screen.queryByText(/hard to read/)).toBeNull();
  });
});
