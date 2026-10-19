import 'fast-text-encoding'; // Required before the QR import — see Vega known issues.

import React from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityDescribedBy, accessibilityOrientationText) are declared here.
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from '@amazon-devices/react-native-kepler';
import QRCode from '@amazon-devices/react-native-qrcode-svg';

import {useTextScale} from '../hooks/useTextScale';
import type {IncomingStatus} from '../hooks/useIncomingDocument';
import type {PairingSession} from '../services/documentService';
import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits, type TextType} from '../theme/layout';
import {layout} from '../theme/styles';
import type {Colours} from '../theme/colours';
import {TvButton} from '../components/TvButton';
import {
  CameraIcon,
  CheckIcon,
  PhoneIcon,
  TvIcon,
  WarningIcon,
} from '../components/Icons';

type Props = {
  status: IncomingStatus;
  /** Null until the backend has issued a code. */
  session: PairingSession | null;
  /** Set when the last attempt failed, so the user is told rather than left waiting. */
  error?: string | null;
  /** Letters already read on this TV, to open again without a new photo. */
  recentCount?: number;
  onRecent?: () => void;
};

/** "482134" -> "482 134": easier to read out and to compare with the phone. */
export const formatCode = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

const STATUS_TEXT: Record<IncomingStatus, string> = {
  connecting: 'Getting ready…',
  waiting: 'Waiting for a photo…',
  processing: 'Reading your letter. This takes about half a minute.',
  arrived: '',
  error: '',
};

const STEPS = [
  {Icon: PhoneIcon, text: 'Point a phone camera at the square on the right'},
  {
    Icon: CameraIcon,
    text: 'Tap the link that pops up, then photograph the letter',
  },
  {Icon: TvIcon, text: 'It appears here in large print, and can be read aloud'},
];

export const PairingScreen = ({
  status,
  session,
  error,
  recentCount = 0,
  onRecent,
}: Props) => {
  const {scale, scaled, restored, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();
  const {colours, cycle} = useColours();
  const {dp, type} = useDesignUnits();
  // Text that follows the viewer's text size.
  const t = (px: number) => type(scaled(px));
  const spokenCode = session ? session.code.split('').join(' ') : '';
  const processing = status === 'processing';
  const failed = status === 'error' && !!error;

  // Shown in the debug line so a tester can read the logical viewport off the
  // screen. Every size is in design pixels scaled to this window, so the
  // layout matches the 1920 × 1080 drawing whatever the TV reports.
  const window = Dimensions.get('window');
  const windowText = `${Math.round(window.width)}×${Math.round(
    window.height,
  )} @${window.scale}x`;

  if (processing) {
    // The photo is on its way: the code has done its job, so the screen
    // says one thing only, in large print, until the letter is ready.
    return (
      <View
        style={[
          layout.fill,
          {
            backgroundColor: colours.background,
            paddingHorizontal: dp(160),
            paddingVertical: dp(120),
          },
        ]}
        accessibilityOrientationText="Reading your letter. It will appear here in about half a minute.">
        <Text
          role="heading"
          style={[layout.bold, {color: colours.text}, t(56)]}>
          Reading your letter
        </Text>
        <View style={{marginTop: dp(56)}}>
          <Progress colours={colours} dp={dp} t={t} />
        </View>
        <Text
          aria-live="polite"
          style={[{color: colours.textSecondary, marginTop: dp(24)}, t(30)]}
          testID={`pairing-${status}`}>
          {STATUS_TEXT[status]}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        layout.fill,
        {
          backgroundColor: colours.background,
          // TV overscan safe area: ~5% inset so nothing is lost on real hardware.
          paddingHorizontal: dp(96),
          paddingVertical: dp(54),
        },
      ]}
      accessibilityOrientationText={
        'Pairing screen. Ask someone to point a phone camera at the square ' +
        'on the right of the screen, then take a photo of a letter. ' +
        'It will appear here in large print and can be read aloud. ' +
        'Text size and colour controls are at the bottom left.'
      }>
      <Text role="heading" style={[layout.bold, {color: colours.text}, t(44)]}>
        Read anything on your TV
      </Text>

      <View style={[layout.fillRow, {marginTop: dp(28)}]}>
        <View style={[styles.stepsColumn, {paddingRight: dp(64)}]}>
          {/* Nothing in here takes focus, so a remote cannot scroll it; the
              scroll view only keeps an overflow at the largest text sizes
              from being drawn over the status line. */}
          <ScrollView
            style={layout.fill}
            contentContainerStyle={{paddingBottom: dp(16)}}
            showsVerticalScrollIndicator={false}>
            {failed ? (
              <ProblemPanel message={error!} colours={colours} dp={dp} t={t} />
            ) : (
              STEPS.map((step, index) => (
                <Step
                  key={step.text}
                  number={index + 1}
                  text={step.text}
                  icon={<step.Icon size={dp(56)} color={colours.text} />}
                  colours={colours}
                  dp={dp}
                  t={t}
                />
              ))
            )}
          </ScrollView>

          {failed ? null : (
            <View
              style={[
                layout.row,
                layout.startSelf,
                {
                  marginTop: dp(16),
                  paddingVertical: dp(18),
                  paddingHorizontal: dp(28),
                  borderRadius: dp(12),
                  borderWidth: dp(4),
                  borderColor: colours.cardEdge,
                  backgroundColor: colours.cardFill,
                },
              ]}>
              <View
                style={{
                  width: dp(22),
                  height: dp(22),
                  borderRadius: dp(11),
                  marginRight: dp(18),
                  backgroundColor: colours.text,
                }}
              />
              <Text
                // Spoken whenever it changes, so a blind user hears "waiting"
                // (time to ask for a scan) and "reading" without moving focus.
                aria-live="polite"
                style={[{color: colours.text}, t(30)]}
                testID={`pairing-${status}`}>
                {STATUS_TEXT[status]}
              </Text>
            </View>
          )}
        </View>

        {/* The QR and code never scroll — a user cannot pair without them. */}
        <View style={styles.qrColumn}>
          {/* The QR carries information, so it needs a spoken equivalent. A
              screen reader user cannot scan it themselves; they need to know
              what to ask for and what code the helper's phone will show. */}
          <View
            nativeID="pairing-qr"
            accessible={true}
            aria-label={
              session
                ? `Square code for a phone camera. Ask someone to scan it to send a photo. Their phone will show the code ${spokenCode}.`
                : 'Square code for a phone camera. Getting ready.'
            }
            style={[
              layout.qrPaper,
              {
                padding: dp(24),
                borderRadius: dp(12),
                borderWidth: dp(3),
                borderColor: colours.qrEdge,
              },
            ]}>
            {session ? (
              <QRCode value={session.captureUrl} size={dp(300)} ecl="M" />
            ) : (
              <View
                style={[
                  layout.qrPlaceholder,
                  {width: dp(300), height: dp(300)},
                ]}
                testID="qr-placeholder"
              />
            )}
          </View>
          {/* Fixed sizes: this block must fit beside the steps at every text size. */}
          <Text
            nativeID="pairing-code-label"
            style={[
              layout.textCentre,
              {color: colours.textSecondary, marginTop: dp(20)},
              type(22),
            ]}>
            {session ? 'The phone will show this code' : ' '}
          </Text>
          <Text
            nativeID="pairing-code"
            testID="pairing-code"
            style={[
              layout.bold,
              layout.textCentre,
              {color: colours.text, letterSpacing: dp(6)},
              type(56),
            ]}>
            {session ? formatCode(session.code) : '--- ---'}
          </Text>
        </View>
      </View>

      {/* Controls stay put so they are never scrolled off screen. */}
      <TVFocusGuideView style={[layout.rowWrap, {marginTop: dp(28)}]}>
        {recentCount > 0 && onRecent && (
          <TvButton
            label="Recent letters"
            accessibilityLabel={`Recent letters: ${recentCount} on this TV. Read one again without a new photo.`}
            onPress={onRecent}
            // First, so a letter left by mistake is one press away.
            hasTVPreferredFocus
            describedBy={['pairing-code-label', 'pairing-code']}
            testID="control-Recent letters"
            fontPx={30}
          />
        )}
        <TvButton
          label="Bigger text"
          onPress={() => changeScale(1)}
          disabled={!canGoBigger}
          hasTVPreferredFocus={recentCount === 0}
          // The pairing code can never take focus, so link it to the first control.
          describedBy={['pairing-code-label', 'pairing-code']}
          testID="size-button-Bigger text"
          fontPx={30}
        />
        <TvButton
          label="Smaller text"
          onPress={() => changeScale(-1)}
          disabled={!canGoSmaller}
          testID="size-button-Smaller text"
          fontPx={30}
        />
        <TvButton
          label={`Colours: ${colours.shortLabel}`}
          accessibilityLabel={`Colours, ${colours.label}. Press to change.`}
          onPress={cycle}
          testID="colours-button"
          fontPx={30}
        />
        <Text
          style={[{color: colours.textSecondary, marginLeft: dp(8)}, type(22)]}>
          {restored
            ? `Text size ${scale}x (saved) · ${windowText}`
            : 'Loading your settings…'}
        </Text>
        <View style={layout.fill} />
        <Text style={[{color: colours.textSecondary}, type(22)]}>
          Left and Right to choose · Select to press · Back to leave
        </Text>
      </TVFocusGuideView>
    </View>
  );
};

type PartProps = {
  colours: Colours;
  dp: (px: number) => number;
  t: (px: number) => TextType;
};

const Badge = ({
  colours,
  dp,
  children,
  hollow,
}: {
  colours: Colours;
  dp: (px: number) => number;
  children: React.ReactNode;
  hollow?: boolean;
}) => (
  <View
    style={[
      layout.centre,
      {
        width: dp(72),
        height: dp(72),
        borderRadius: dp(36),
        marginRight: dp(24),
        backgroundColor: hollow ? colours.background : colours.badgeFill,
        borderWidth: dp(hollow ? 6 : 0),
        borderColor: colours.text,
      },
    ]}>
    {children}
  </View>
);

const Numeral = ({
  value,
  color,
  dp,
}: {
  value: number;
  color: string;
  dp: (px: number) => number;
}) => (
  <Text style={[layout.bold, {color, fontSize: dp(36), lineHeight: dp(44)}]}>
    {value}
  </Text>
);

const Step = ({
  number,
  text,
  icon,
  colours,
  dp,
  t,
}: PartProps & {number: number; text: string; icon: React.ReactNode}) => (
  <View style={[layout.row, {marginBottom: dp(32)}]}>
    <Badge colours={colours} dp={dp}>
      <Numeral value={number} color={colours.badgeText} dp={dp} />
    </Badge>
    <View style={{marginRight: dp(24)}}>{icon}</View>
    <Text style={[layout.fill, {color: colours.text}, t(30)]}>{text}</Text>
  </View>
);

/**
 * Two honest steps: the backend reports only "processing", so the TV cannot
 * tell reading the words apart from making the voice.
 */
const Progress = ({colours, dp, t}: PartProps) => (
  <View>
    <View style={[layout.row, {marginBottom: dp(32)}]}>
      <Badge colours={colours} dp={dp}>
        <CheckIcon size={dp(40)} color={colours.badgeText} />
      </Badge>
      <Text style={[layout.fill, {color: colours.text}, t(30)]}>
        Photo received
        <Text style={{color: colours.textSecondary}}> — done</Text>
      </Text>
    </View>
    <View style={[layout.row, {marginBottom: dp(32)}]}>
      <Badge colours={colours} dp={dp} hollow>
        <Numeral value={2} color={colours.text} dp={dp} />
      </Badge>
      <Text style={[layout.fill, layout.bold, {color: colours.text}, t(30)]}>
        Reading the words
        <Text style={[layout.regular, {color: colours.textSecondary}]}>
          {' '}
          — now
        </Text>
      </Text>
    </View>
  </View>
);

/** A problem is a panel with an icon and a first word, never colour alone. */
const ProblemPanel = ({
  message,
  colours,
  dp,
  t,
}: PartProps & {message: string}) => (
  <View
    style={{
      padding: dp(32),
      borderRadius: dp(16),
      borderWidth: dp(6),
      borderColor: colours.attention,
      backgroundColor: colours.panelFill,
    }}>
    <View style={[layout.row, {marginBottom: dp(16)}]}>
      <View style={{marginRight: dp(20)}}>
        <WarningIcon size={dp(56)} color={colours.attention} />
      </View>
      <Text style={[layout.bold, {color: colours.attentionWord}, t(40)]}>
        Problem
      </Text>
    </View>
    {/* role="alert" so the screen reader speaks it without needing focus,
        which it can never receive. */}
    <Text
      role="alert"
      style={[{color: colours.text}, t(30)]}
      testID="pairing-error">
      {message}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  stepsColumn: {flex: 3, minWidth: 0},
  qrColumn: {flex: 2, alignItems: 'center', justifyContent: 'center'},
});
