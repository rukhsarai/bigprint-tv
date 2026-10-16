import React, {useCallback, useEffect, useRef, useState} from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityDescribedBy, accessibilityOrientationText) are declared here.
import {
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  TVFocusGuideView,
  View,
  type LayoutChangeEvent,
} from '@amazon-devices/react-native-kepler';

import {useTextScale} from '../hooks/useTextScale';
import {useReadAloud} from '../hooks/useReadAloud';
import type {SpeechMark} from '../data/speechMarks';
import type {ScannedDocument} from '../data/documents';
import type {AudioPlayer} from '../services/audioPlayer';
import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits, type TextType} from '../theme/layout';
import type {Colours} from '../theme/colours';
import {TvButton} from '../components/TvButton';
import {SpeakerIcon, WarningIcon} from '../components/Icons';
import {layout} from '../theme/styles';

type Props = {
  document: ScannedDocument;
  /** Null when the platform has no audio: lines are then highlighted silently. */
  player: AudioPlayer | null;
  /** Where a line's audio lives, or null when there is none. */
  audioUrl: (lineIndex: number) => string | null;
  onBack: () => void;
};

export const DocumentView = ({document, player, audioUrl, onBack}: Props) => {
  const {scale, scaled, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();
  const {colours, cycle} = useColours();
  const {dp, type} = useDesignUnits();
  const t = (px: number) => type(scaled(px));
  const {readingLine, wordIndex, marks, toggle, stop} = useReadAloud(player);

  // "Read whole letter": when a line ends, the next one starts by itself.
  const [continuous, setContinuous] = useState(false);
  const scroller = useRef<React.ElementRef<typeof ScrollView>>(null);
  const lineTops = useRef<number[]>([]);
  const lastLine = useRef<number | null>(null);

  const readLine = useCallback(
    (index: number) =>
      toggle(index, document.lines[index], {
        marks: document.speech?.[index]?.marks,
        audioUrl: audioUrl(index),
      }),
    [toggle, document, audioUrl],
  );

  // Pressing a line reads just that line, and ends a whole-letter reading.
  const pressLine = (index: number) => {
    setContinuous(false);
    readLine(index);
  };

  const toggleWholeLetter = () => {
    if (continuous) {
      setContinuous(false);
      stop();
      return;
    }
    setContinuous(true);
    // Already reading a line: carry on from it. Otherwise start at the top.
    if (readingLine === null && document.lines.length > 0) {
      readLine(0);
    }
  };

  useEffect(() => {
    const previous = lastLine.current;
    lastLine.current = readingLine;
    if (readingLine !== null) {
      // Focus stays on the button, so the list will not follow by itself.
      if (continuous) {
        const top = lineTops.current[readingLine];
        if (top !== undefined) {
          scroller.current?.scrollTo({
            y: Math.max(0, top - dp(8)),
            animated: false,
          });
        }
      }
      return;
    }
    if (continuous && previous !== null) {
      // Skip blank lines: a line with no words has nothing to play and would
      // never end, which would stall the reading.
      let next = previous + 1;
      while (next < document.lines.length && !/\S/.test(document.lines[next])) {
        next++;
      }
      if (next < document.lines.length) {
        readLine(next);
      } else {
        setContinuous(false);
      }
    }
  }, [readingLine, continuous, document.lines, readLine, dp]);

  const handleBack = useCallback(() => {
    setContinuous(false);
    stop();
    onBack();
  }, [stop, onBack]);

  // The remote's Back key must leave the document, not the app. Without a
  // listener Vega's default handler exits; returning true claims the press.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  // Screen reader focus follows input focus on Fire TV, so static text can
  // never be reached on its own. The key facts and any warning are linked to
  // the first line instead, so they are spoken when the reader enters the body.
  const describedByIds = [
    ...(document.lowConfidence ? ['read-warning'] : []),
    ...document.keyFacts.map((_, index) => `fact-${index}`),
  ];

  const count = document.lines.length;
  const position =
    readingLine !== null
      ? `Reading line ${readingLine + 1} of ${count}`
      : count === 1
      ? '1 line'
      : `${count} lines`;

  const lineType = t(30);
  const bar = dp(Math.round(12 * scale));

  return (
    <View
      style={[
        layout.fill,
        {
          backgroundColor: colours.background,
          paddingHorizontal: dp(96),
          paddingVertical: dp(54),
        },
      ]}
      accessibilityOrientationText={
        'Document view. Any important figures are listed at the top. ' +
        'Press up and down to move through the text one line at a time. ' +
        'Press select to hear a line read aloud. ' +
        'Read whole letter, text size and colour controls are at the bottom.'
      }>
      <View style={layout.baselineRow}>
        <Text
          role="heading"
          style={[layout.bold, {color: colours.text}, t(32)]}>
          {document.kind}
        </Text>
        {document.sender && (
          <Text
            style={[
              layout.shrink,
              {color: colours.textSecondary, marginLeft: dp(20)},
              t(22),
            ]}>
            from {document.sender}
          </Text>
        )}
        <View style={layout.fill} />
        {/* Not a live region: during a whole-letter reading it changes every
            line, and VoiceView would talk over the voice reading the letter. */}
        <Text
          style={[{color: colours.textSecondary}, type(24)]}
          testID="line-position">
          {position}
        </Text>
      </View>

      {document.lowConfidence && (
        <View
          style={[
            layout.row,
            {
              marginTop: dp(16),
              paddingVertical: dp(10),
              paddingHorizontal: dp(20),
              borderRadius: dp(12),
              borderWidth: dp(6),
              borderColor: colours.attention,
              backgroundColor: colours.panelFill,
            },
          ]}>
          <View style={{marginRight: dp(16)}}>
            <WarningIcon size={dp(34)} color={colours.attention} />
          </View>
          <Text
            nativeID="read-warning"
            role="alert"
            style={[layout.fill, {color: colours.text}, t(24)]}>
            <Text style={[layout.bold, {color: colours.attentionWord}]}>
              Check:{' '}
            </Text>
            some words were hard to read. Compare with the paper copy.
          </Text>
        </View>
      )}

      {/* Key facts are pinned: these are the figures a reader must not miss.
          Not every document has them — a card or a personal letter has none.
          Fixed sizes, so they fit at every text size. */}
      {document.keyFacts.length > 0 && (
        <View style={[layout.wrap, {marginTop: dp(16)}]}>
          {document.keyFacts.map((fact, index) => (
            <View
              key={fact.label}
              nativeID={`fact-${index}`}
              style={{
                paddingVertical: dp(8),
                paddingHorizontal: dp(18),
                marginRight: dp(20),
                marginBottom: dp(8),
                borderRadius: dp(10),
                borderWidth: dp(4),
                borderColor: colours.cardEdge,
                backgroundColor: colours.cardFill,
              }}>
              <Text style={[{color: colours.textSecondary}, type(20)]}>
                {fact.label}
              </Text>
              <Text style={[layout.bold, {color: colours.keyFigure}, type(40)]}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Each line is focusable, so Up/Down on the remote steps line by line. */}
      <ScrollView
        ref={scroller}
        style={[layout.fill, {marginTop: dp(8)}]}
        contentContainerStyle={{paddingBottom: dp(16)}}
        showsVerticalScrollIndicator={false}>
        <TVFocusGuideView>
          {document.lines.map((line, index) => (
            <DocumentLine
              key={index}
              text={line}
              textType={lineType}
              bar={bar}
              colours={colours}
              dp={dp}
              isSpoken={readingLine === index}
              marks={readingLine === index ? marks : []}
              wordIndex={readingLine === index ? wordIndex : -1}
              onPress={() => pressLine(index)}
              onLayout={(e) => {
                lineTops.current[index] = e.nativeEvent.layout.y;
              }}
              hasTVPreferredFocus={index === 0}
              describedBy={index === 0 ? describedByIds : undefined}
              testID={`line-${index}`}
            />
          ))}
        </TVFocusGuideView>
      </ScrollView>

      <TVFocusGuideView style={[layout.rowWrap, {marginTop: dp(12)}]}>
        <TvButton
          label={continuous ? 'Stop reading' : 'Read whole letter'}
          onPress={toggleWholeLetter}
          icon={(color, size) => <SpeakerIcon size={size} color={color} />}
          testID="control-Read whole letter"
        />
        <TvButton
          label="Bigger text"
          onPress={() => changeScale(1)}
          disabled={!canGoBigger}
          testID="control-Bigger text"
        />
        <TvButton
          label="Smaller text"
          onPress={() => changeScale(-1)}
          disabled={!canGoSmaller}
          testID="control-Smaller text"
        />
        <TvButton
          label={`Colours: ${colours.shortLabel}`}
          accessibilityLabel={`Colours, ${colours.label}. Press to change.`}
          onPress={cycle}
          testID="control-Colours"
        />
        <TvButton label="Back" onPress={handleBack} testID="control-Back" />
        <Text
          style={[{color: colours.textSecondary, marginLeft: dp(8)}, type(24)]}>
          Text size {scale}x
        </Text>
      </TVFocusGuideView>
    </View>
  );
};

type DocumentLineProps = {
  text: string;
  textType: TextType;
  /** Thickness of the bar under the spoken word. */
  bar: number;
  colours: Colours;
  dp: (px: number) => number;
  isSpoken: boolean;
  marks: SpeechMark[];
  wordIndex: number;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  hasTVPreferredFocus?: boolean;
  describedBy?: string[];
  testID: string;
};

/**
 * One line of the letter. Focus is a thick ring round the line; the letters
 * keep the colours the viewer chose, because flipping a line to dark-on-light
 * where the reader is looking undoes the reason they chose a dark screen.
 * The ring's space is always reserved, so focus never moves the text.
 */
const DocumentLine = ({
  text,
  textType,
  bar,
  colours,
  dp,
  isSpoken,
  marks,
  wordIndex,
  onPress,
  onLayout,
  hasTVPreferredFocus,
  describedBy,
  testID,
}: DocumentLineProps) => {
  const [focused, setFocused] = useState(false);
  const spoken = isSpoken ? marks[wordIndex] : undefined;
  return (
    <Pressable
      accessible={true}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onLayout={onLayout}
      hasTVPreferredFocus={hasTVPreferredFocus}
      // A line is pressable (it reads aloud), so it is a button, not text.
      role="button"
      aria-label={text}
      accessibilityHint="Press select to hear this line read aloud"
      accessibilityDescribedBy={describedBy}
      testID={testID}
      style={{
        borderWidth: dp(14),
        borderColor: focused ? colours.focus : colours.background,
        borderRadius: dp(16),
        paddingHorizontal: dp(16),
        paddingTop: dp(4),
        paddingBottom: dp(6),
        backgroundColor: colours.background,
      }}>
      <LineWords
        text={text}
        spoken={spoken}
        textType={textType}
        bar={bar}
        colours={colours}
      />
    </Pressable>
  );
};

type Token = {text: string; start: number; end: number};

/** Words with their character offsets, so speech marks can find them. */
export const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({text: m[0], start: m.index, end: m.index + m[0].length});
  }
  return tokens;
};

/**
 * Lays the line out word by word so the spoken word can carry a thick bar
 * underneath. Nested text cannot draw a bar of a chosen thickness, and a
 * filled box would flip the word's colours. Every word reserves the bar's
 * space, so the line never moves as the voice goes along. The offsets come
 * from the speech marks, so Polly's marks line up exactly, including
 * punctuation next to a word.
 */
const LineWords = ({
  text,
  spoken,
  textType,
  bar,
  colours,
}: {
  text: string;
  spoken?: SpeechMark;
  textType: TextType;
  bar: number;
  colours: Colours;
}) => {
  const gap = Math.round(textType.fontSize * 0.28);
  const slot = {
    borderBottomWidth: bar,
    borderBottomColor: 'transparent',
    paddingBottom: Math.max(1, Math.round(bar / 6)),
  };
  const ink = [{color: colours.text}, textType];
  return (
    <View style={layout.wrap}>
      {tokenize(text).map((token, index) => {
        const hit =
          spoken !== undefined &&
          token.start < spoken.end &&
          spoken.start < token.end;
        if (!hit) {
          return (
            <View key={index} style={[slot, {marginRight: gap}]}>
              <Text style={ink}>{token.text}</Text>
            </View>
          );
        }
        const from = Math.max(spoken.start, token.start) - token.start;
        const to = Math.min(spoken.end, token.end) - token.start;
        return (
          <View key={index} style={[layout.plainRow, {marginRight: gap}]}>
            {from > 0 ? (
              <View style={slot}>
                <Text style={ink}>{token.text.slice(0, from)}</Text>
              </View>
            ) : null}
            <View
              style={[slot, {borderBottomColor: colours.spokenBar}]}
              testID="spoken-word">
              <Text style={[ink, {color: colours.spokenText}]}>
                {token.text.slice(from, to)}
              </Text>
            </View>
            {to < token.text.length ? (
              <View style={slot}>
                <Text style={ink}>{token.text.slice(to)}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};
