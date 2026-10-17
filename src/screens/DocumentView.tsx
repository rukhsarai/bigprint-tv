import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityDescribedBy, accessibilityOrientationText) are declared here.
import {
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  TVFocusGuideView,
  View,
} from '@amazon-devices/react-native-kepler';

import {useTextScale} from '../hooks/useTextScale';
import {useListen, type ListenState} from '../hooks/useListen';
import {
  VIEW_LABEL,
  VIEW_ORDER,
  nextView,
  useDocumentViewChoice,
  type DocumentViewName,
} from '../hooks/useDocumentViewChoice';
import type {ExactLine, ScannedDocument} from '../data/documents';
import type {AudioPlayer} from '../services/audioPlayer';
import type {DocumentService} from '../services/documentService';
import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits, type TextType} from '../theme/layout';
import {layout} from '../theme/styles';
import type {Colours} from '../theme/colours';
import {TvButton} from '../components/TvButton';
import {CameraIcon, SpeakerIcon, WarningIcon} from '../components/Icons';

type Props = {
  document: ScannedDocument;
  /** Null when the platform has no audio. */
  player: AudioPlayer | null;
  /** Makes the voice when someone asks to listen. */
  service: DocumentService;
  /** The next photo is already read and waiting. */
  nextReady: boolean;
  /** Go on to the next photo: the code to send one, or the one waiting. */
  onNext: () => void;
};

const LISTEN_LABEL: Record<ListenState, string> = {
  idle: 'Listen',
  preparing: 'Getting the voice…',
  playing: 'Pause',
  paused: 'Carry on listening',
  unavailable: 'No voice',
};

const LISTEN_SPOKEN: Record<ListenState, string> = {
  idle: 'Listen to the whole letter read aloud.',
  preparing: 'Getting the voice ready. Press to cancel.',
  playing: 'Pause the voice.',
  paused: 'Carry on listening from where it stopped.',
  unavailable: 'The voice is not available for this letter.',
};

/**
 * The letter in large print. Reading it on screen is the point: as the whole
 * letter in plain English, as its main points, or as the exact words on the
 * page. Listening is the other way in, for someone busy or tired: the whole
 * letter read aloud, start to finish, while nothing on screen moves.
 *
 * Next photo goes on to the next page, so a pile of post can be read one
 * after another without starting again.
 */
export const DocumentView = ({
  document,
  player,
  service,
  nextReady,
  onNext,
}: Props) => {
  const {scale, scaled, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();
  const {colours, cycle} = useColours();
  const {dp, type, unit} = useDesignUnits();
  const {view: savedView, setView} = useDocumentViewChoice();
  const t = (px: number) => type(scaled(px));
  const listen = useListen(player, service, document);
  const canListen = player !== null && service.canListen(document);

  // Older results have only the full letter; offer what this one has.
  const offered = useMemo(
    () =>
      VIEW_ORDER.filter(
        (name) =>
          name === 'full' ||
          (name === 'points' && (document.summary?.length ?? 0) > 0) ||
          (name === 'exact' && (document.exact?.length ?? 0) > 0),
      ),
    [document],
  );
  const view: DocumentViewName = offered.includes(savedView)
    ? savedView
    : 'full';

  const shown: ExactLine[] = useMemo(() => {
    if (view === 'exact') {
      return document.exact ?? [];
    }
    const source = view === 'points' ? document.summary ?? [] : document.lines;
    return source.map((text) => ({text, kind: 'text'}));
  }, [document, view]);

  const scroller = useRef<React.ElementRef<typeof ScrollView>>(null);

  // The voice is the whole letter whichever view is on screen, so changing
  // the view leaves it playing.
  const changeView = () => {
    scroller.current?.scrollTo({y: 0, animated: false});
    setView(nextView(view, offered));
  };

  const {stop} = listen;
  const handleNext = useCallback(() => {
    stop();
    onNext();
  }, [stop, onNext]);

  // The remote's Back key must leave the document, not the app. Without a
  // listener Vega's default handler exits; returning true claims the press.
  // It does what Next photo does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleNext();
      return true;
    });
    return () => sub.remove();
  }, [handleNext]);

  // Screen reader focus follows input focus on Fire TV, so static text can
  // never be reached on its own. The key facts and any warning are linked to
  // the first line instead, so they are spoken when the reader enters the body.
  const describedByIds = useMemo(
    () => [
      ...(document.lowConfidence ? ['read-warning'] : []),
      ...document.keyFacts.map((_, index) => `fact-${index}`),
    ],
    [document],
  );

  const count = shown.length;
  const position =
    listen.state === 'playing'
      ? 'Reading aloud'
      : listen.state === 'paused'
      ? 'Paused'
      : listen.state === 'preparing'
      ? 'Getting the voice ready…'
      : view === 'exact'
      ? `${count} lines as printed`
      : view === 'points'
      ? count === 1
        ? '1 main point'
        : `${count} main points`
      : count === 1
      ? '1 line'
      : `${count} lines`;

  const lineType = useMemo(() => type(scaled(30)), [type, scaled]);
  const headingType = useMemo(() => type(scaled(36)), [type, scaled]);

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
        'The view button switches between the full letter, the main points ' +
        'and the exact words. Listen reads the whole letter aloud. ' +
        'Next photo goes on to the next page. ' +
        'Text size and colour controls are at the bottom.'
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
        {/* Not a live region: VoiceView would talk over the voice reading
            the letter. The Listen button says the same when focused. */}
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
          {shown.map((line, index) => (
            <DocumentLine
              key={`${view}-${index}`}
              index={index}
              text={line.text}
              kind={line.kind}
              numbered={view === 'points'}
              textType={line.kind === 'heading' ? headingType : lineType}
              unit={unit}
              colours={colours}
              hasTVPreferredFocus={index === 0}
              describedBy={index === 0 ? describedByIds : undefined}
            />
          ))}
        </TVFocusGuideView>
      </ScrollView>

      <TVFocusGuideView style={[layout.rowWrap, {marginTop: dp(12)}]}>
        {offered.length > 1 && (
          <TvButton
            label={`View: ${VIEW_LABEL[view]}`}
            accessibilityLabel={`View, ${VIEW_LABEL[view]}. Press to change.`}
            onPress={changeView}
            testID="control-View"
          />
        )}
        {canListen && (
          <TvButton
            label={LISTEN_LABEL[listen.state]}
            accessibilityLabel={LISTEN_SPOKEN[listen.state]}
            onPress={listen.press}
            disabled={listen.state === 'unavailable'}
            icon={(color, size) => <SpeakerIcon size={size} color={color} />}
            testID="control-Listen"
          />
        )}
        <TvButton
          label={nextReady ? 'Next photo is ready' : 'Next photo'}
          accessibilityLabel={
            nextReady
              ? 'Next photo. It has been read and is ready to show.'
              : 'Next photo. Send another page from your phone.'
          }
          onPress={handleNext}
          icon={(color, size) => <CameraIcon size={size} color={color} />}
          testID="control-Next photo"
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
        <Text
          style={[{color: colours.textSecondary, marginLeft: dp(8)}, type(24)]}>
          Text size {scale}x
        </Text>
      </TVFocusGuideView>
    </View>
  );
};

type DocumentLineProps = {
  index: number;
  text: string;
  kind: ExactLine['kind'];
  /** Main points are numbered, so they read as a list. */
  numbered: boolean;
  textType: TextType;
  unit: number;
  colours: Colours;
  hasTVPreferredFocus?: boolean;
  describedBy?: string[];
};

/**
 * One line of the letter, for reading. Focus is a thick ring round the line;
 * the letters keep the colours the viewer chose, because flipping a line to
 * dark-on-light where the reader is looking undoes the reason they chose a
 * dark screen. The ring's space is always reserved, so nothing moves.
 *
 * Memoised, so moving focus re-renders two lines, not the whole letter: at a
 * large size that is what keeps a TV from stuttering.
 */
const DocumentLine = memo(
  ({
    index,
    text,
    kind,
    numbered,
    textType,
    unit,
    colours,
    hasTVPreferredFocus,
    describedBy,
  }: DocumentLineProps) => {
    const [focused, setFocused] = useState(false);
    const dp = (px: number) => Math.round(px * unit);
    const prefix = numbered ? `${index + 1}.  ` : kind === 'row' ? '▸ ' : '';
    return (
      // Pressable only so it can take focus: Up/Down steps through the
      // letter and the screen reader reads each line. Pressing does nothing.
      <Pressable
        accessible={true}
        focusable={true}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={hasTVPreferredFocus}
        aria-label={`${prefix}${text}`}
        accessibilityDescribedBy={describedBy}
        testID={`line-${index}`}
        style={[
          layout.plainRow,
          {
            borderWidth: dp(14),
            borderColor: focused ? colours.focus : colours.background,
            borderRadius: dp(16),
            paddingHorizontal: dp(28),
            paddingTop: dp(kind === 'heading' ? 14 : 4),
            paddingBottom: dp(6),
            backgroundColor: colours.background,
          },
        ]}>
        <Text
          role={kind === 'heading' ? 'heading' : undefined}
          style={[
            layout.fill,
            kind === 'heading' ? layout.bold : null,
            {color: colours.text},
            textType,
          ]}>
          {prefix}
          {text}
        </Text>
      </Pressable>
    );
  },
);
