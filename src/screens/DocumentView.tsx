import React, {useState} from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityDescribedBy, accessibilityOrientationText) are declared here.
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from '@amazon-devices/react-native-kepler';

import {useTextScale} from '../hooks/useTextScale';
import {useReadAloud} from '../hooks/useReadAloud';
import type {SpeechMark} from '../data/speechMarks';
import type {ScannedDocument} from '../data/documents';

type Props = {
  document: ScannedDocument;
  onBack: () => void;
};

export const DocumentView = ({document, onBack}: Props) => {
  const {scale, scaled, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();
  const {readingLine, wordIndex, marks, toggle, stop} = useReadAloud();

  const handleBack = () => {
    stop();
    onBack();
  };

  // Screen reader focus follows input focus on Fire TV, so static text can
  // never be reached on its own. The key facts and any warning are linked to
  // the first line instead, so they are spoken when the reader enters the body.
  const describedByIds = [
    ...(document.lowConfidence ? ['read-warning'] : []),
    ...document.keyFacts.map((_, index) => `fact-${index}`),
  ];

  return (
    <View
      style={styles.screen}
      accessibilityOrientationText={
        'Document view. Any important figures are listed at the top. ' +
        'Press up and down to move through the text one line at a time. ' +
        'Press select to hear a line read aloud. ' +
        'Text size controls are at the bottom.'
      }>
      <View style={styles.header}>
        <Text role="heading" style={[styles.kind, {fontSize: scaled(32)}]}>
          {document.kind}
        </Text>
        {document.sender && (
          <Text style={[styles.sender, {fontSize: scaled(22)}]}>
            from {document.sender}
          </Text>
        )}
      </View>

      {document.lowConfidence && (
        <View style={styles.warning}>
          <Text nativeID="read-warning" role="alert" style={styles.warningText}>
            Some words were hard to read. Please check against the paper copy.
          </Text>
        </View>
      )}

      {/* Key facts are pinned: these are the figures a reader must not miss.
          Not every document has them — a card or a personal letter has none. */}
      {document.keyFacts.length > 0 && (
        <View style={styles.factsRow}>
          {document.keyFacts.map((fact, index) => (
            <View
              key={fact.label}
              nativeID={`fact-${index}`}
              style={styles.fact}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Each line is focusable, so Up/Down on the remote steps line by line. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}>
        <TVFocusGuideView>
          {document.lines.map((line, index) => (
            <DocumentLine
              key={index}
              text={line}
              fontSize={scaled(30)}
              isSpoken={readingLine === index}
              marks={readingLine === index ? marks : []}
              wordIndex={readingLine === index ? wordIndex : -1}
              onPress={() => toggle(index, line)}
              hasTVPreferredFocus={index === 0}
              describedBy={index === 0 ? describedByIds : undefined}
              testID={`line-${index}`}
            />
          ))}
        </TVFocusGuideView>
      </ScrollView>

      <TVFocusGuideView style={styles.controls}>
        <ControlButton
          label="Bigger text"
          onPress={() => changeScale(1)}
          disabled={!canGoBigger}
        />
        <ControlButton
          label="Smaller text"
          onPress={() => changeScale(-1)}
          disabled={!canGoSmaller}
        />
        <ControlButton label="Back" onPress={handleBack} />
        <Text style={styles.status}>Text size {scale}x</Text>
      </TVFocusGuideView>
    </View>
  );
};

type DocumentLineProps = {
  text: string;
  fontSize: number;
  isSpoken: boolean;
  marks: SpeechMark[];
  wordIndex: number;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  describedBy?: string[];
  testID: string;
};

/**
 * Splits the line into runs using the speech marks' character offsets, so the
 * word currently being spoken can be highlighted without altering the text.
 * Offsets come from the marks rather than a local split, so real Polly marks
 * line up exactly — including punctuation the tokeniser would disagree about.
 */
const DocumentLine = ({
  text,
  fontSize,
  isSpoken,
  marks,
  wordIndex,
  onPress,
  hasTVPreferredFocus,
  describedBy,
  testID,
}: DocumentLineProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessible={true}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      // A line is pressable (it reads aloud), so it is a button, not text.
      role="button"
      aria-label={text}
      accessibilityHint="Press select to hear this line read aloud"
      accessibilityDescribedBy={describedBy}
      testID={testID}
      style={[
        styles.line,
        focused && styles.lineFocused,
        isSpoken && styles.lineSpoken,
      ]}>
      <Text
        style={[
          styles.lineText,
          {fontSize, lineHeight: Math.round(fontSize * 1.4)},
          focused && styles.lineTextFocused,
        ]}>
        {isSpoken && marks.length > 0
          ? renderWithSpokenWord(text, marks, wordIndex, focused)
          : text}
      </Text>
    </Pressable>
  );
};

/** Rebuilds the line as runs of text, with the spoken word wrapped. */
const renderWithSpokenWord = (
  text: string,
  marks: SpeechMark[],
  wordIndex: number,
  focused: boolean,
) => {
  const mark = marks[wordIndex];
  if (!mark) {
    return text;
  }
  return (
    <>
      {text.slice(0, mark.start)}
      <Text
        style={focused ? styles.spokenWordOnFocus : styles.spokenWord}
        testID="spoken-word">
        {text.slice(mark.start, mark.end)}
      </Text>
      {text.slice(mark.end)}
    </>
  );
};

type ControlButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

const ControlButton = ({label, onPress, disabled}: ControlButtonProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessible={true}
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      role="button"
      aria-label={label}
      aria-disabled={!!disabled}
      testID={`control-${label}`}
      style={[
        styles.button,
        focused && styles.buttonFocused,
        disabled && styles.buttonDisabled,
      ]}>
      <Text style={[styles.buttonText, focused && styles.buttonTextFocused]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 96,
    paddingVertical: 54,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  kind: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sender: {
    color: '#CCCCCC',
    marginLeft: 16,
  },
  warning: {
    backgroundColor: '#5A3E00',
    borderColor: '#FFD400',
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  warningText: {
    color: '#FFD400',
    fontSize: 20,
  },
  // Fixed sizes: key facts must fit on screen at every text scale.
  factsRow: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 12,
  },
  fact: {
    marginRight: 48,
  },
  factLabel: {
    color: '#CCCCCC',
    fontSize: 18,
  },
  factValue: {
    color: '#FFD400',
    fontSize: 34,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 16,
  },
  line: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  lineFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFD400',
  },
  lineSpoken: {
    borderColor: '#4DA3FF',
  },
  // The spoken word is marked by background, not colour alone, so it stays
  // visible to colour-blind users and at low contrast sensitivity.
  spokenWord: {
    backgroundColor: '#FFD400',
    color: '#000000',
    fontWeight: '700',
  },
  spokenWordOnFocus: {
    backgroundColor: '#0B5FA5',
    color: '#FFFFFF',
    fontWeight: '700',
  },
  lineText: {
    color: '#FFFFFF',
  },
  lineTextFocused: {
    color: '#000000',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 12,
  },
  button: {
    backgroundColor: '#222222',
    borderWidth: 3,
    borderColor: '#555555',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginRight: 16,
  },
  buttonFocused: {
    backgroundColor: '#FFD400',
    borderColor: '#FFFFFF',
  },
  // Dimming to 0.4 is a contrast failure for exactly the users this app serves.
  // Signal "unavailable" with a dashed border and grey text that still passes.
  buttonDisabled: {
    backgroundColor: '#111111',
    borderColor: '#767676',
    borderStyle: 'dashed',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  buttonTextFocused: {
    color: '#000000',
  },
  status: {
    color: '#CCCCCC',
    fontSize: 20,
    marginLeft: 8,
  },
});
