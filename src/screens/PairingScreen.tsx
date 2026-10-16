import 'fast-text-encoding'; // Required before the QR import — see Vega known issues.

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
import QRCode from '@amazon-devices/react-native-qrcode-svg';

import {useTextScale} from '../hooks/useTextScale';
import type {IncomingStatus} from '../hooks/useIncomingDocument';
import type {PairingSession} from '../services/documentService';

type Props = {
  status: IncomingStatus;
  /** Null until the backend has issued a code. */
  session: PairingSession | null;
  /** Set when the last attempt failed, so the user is told rather than left waiting. */
  error?: string | null;
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

export const PairingScreen = ({status, session, error}: Props) => {
  const {scale, typeAt, restored, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();
  const spokenCode = session ? session.code.split('').join(' ') : '';

  return (
    <View
      style={styles.screen}
      accessibilityOrientationText={
        'Pairing screen. Ask someone to point a phone camera at the square ' +
        'on the right of the screen, then take a photo of a letter. ' +
        'It will appear here in large print and can be read aloud. ' +
        'Text size controls are at the bottom left.'
      }>
      <View style={styles.left}>
        {/* The instructions are kept short and the title compact so all three
            steps fit above the controls at 1x and 1.25x. At the largest sizes
            they scroll, with the indicator shown so a cut-off line reads as
            "more below" rather than as a rendering fault. */}
        <ScrollView
          style={styles.textScroll}
          contentContainerStyle={styles.textScrollContent}
          showsVerticalScrollIndicator={true}>
          <Text role="heading" style={[styles.title, typeAt(40)]}>
            Read anything on your TV
          </Text>

          <Text style={[styles.body, typeAt(24)]}>
            1. Point a phone at the square on the right
          </Text>
          <Text style={[styles.body, typeAt(24)]}>
            2. Tap the link, then photograph the letter
          </Text>
          <Text style={[styles.body, typeAt(24)]}>
            3. It appears here and can be read aloud
          </Text>
        </ScrollView>

        {/* Controls stay put so they are never scrolled off screen. */}
        <View style={styles.controls}>
          {/* role="alert" so the screen reader speaks it without needing focus,
              which it can never receive. */}
          {status === 'error' && error ? (
            <Text
              role="alert"
              style={[styles.error, typeAt(24)]}
              testID="pairing-error">
              {error}
            </Text>
          ) : (
            <Text
              // Spoken whenever it changes, so a blind user hears "waiting"
              // (time to ask for a scan) and "reading" without moving focus.
              aria-live="polite"
              style={[styles.waiting, typeAt(24)]}
              testID={`pairing-${status}`}>
              {STATUS_TEXT[status]}
            </Text>
          )}
          <TVFocusGuideView style={styles.buttonRow}>
            <SizeButton
              label="Bigger text"
              onPress={() => changeScale(1)}
              disabled={!canGoBigger}
              hasTVPreferredFocus
              describedBy={['pairing-code-label', 'pairing-code']}
            />
            <SizeButton
              label="Smaller text"
              onPress={() => changeScale(-1)}
              disabled={!canGoSmaller}
            />
          </TVFocusGuideView>

          <Text style={styles.debug}>
            {restored ? `Text size ${scale}x (saved)` : 'Loading your settings…'}
          </Text>
        </View>
      </View>

      {/* The QR and code never scroll — a user cannot pair without them. */}
      <View style={styles.right}>
        {/* The QR carries information, so it needs a spoken equivalent. A
            screen reader user cannot scan it themselves; they need to know
            what to ask for and what code the helper's phone will show. */}
        <View
          style={styles.qrFrame}
          nativeID="pairing-qr"
          accessible={true}
          aria-label={
            session
              ? `Square code for a phone camera. Ask someone to scan it to send a photo. Their phone will show the code ${spokenCode}.`
              : 'Square code for a phone camera. Getting ready.'
          }>
          {session ? (
            <QRCode value={session.captureUrl} size={300} ecl="M" />
          ) : (
            <View style={styles.qrPlaceholder} testID="qr-placeholder" />
          )}
        </View>
        <Text nativeID="pairing-code-label" style={styles.codeLabel}>
          {session ? 'The phone will show this code' : ' '}
        </Text>
        <Text nativeID="pairing-code" style={styles.code} testID="pairing-code">
          {session ? formatCode(session.code) : '--- ---'}
        </Text>
      </View>
    </View>
  );
};

type SizeButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  describedBy?: string[];
};

const SizeButton = ({
  label,
  onPress,
  disabled,
  hasTVPreferredFocus,
  describedBy,
}: SizeButtonProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessible={true}
      // Not `disabled`: a disabled Pressable cannot take focus. With text at
      // 2x the preferred-focus button is "Bigger text", which is at its limit,
      // so the screen would open with nothing focused.
      onPress={disabled ? undefined : onPress}
      accessibilityState={{disabled: !!disabled}}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      role="button"
      aria-label={label}
      // The pairing code can never take focus, so link it to the first control.
      accessibilityDescribedBy={describedBy}
      testID={`size-button-${label}`}
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

// High contrast throughout: this audience needs it, not decoration.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
    // TV overscan safe area: ~5% inset so nothing is lost on real hardware.
    paddingHorizontal: 96,
    paddingVertical: 54,
  },
  left: {
    flex: 3,
    paddingRight: 48,
  },
  textScroll: {
    flex: 1,
  },
  textScrollContent: {
    justifyContent: 'center',
    flexGrow: 1,
    paddingBottom: 16,
  },
  controls: {
    flexShrink: 0,
  },
  right: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 16,
  },
  body: {
    color: '#FFFFFF',
    marginBottom: 8,
  },
  // Fixed sizes: this block must fit beside the QR at every text scale.
  codeLabel: {
    color: '#CCCCCC',
    fontSize: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  code: {
    color: '#FFD400',
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    // Wrap rather than overflow: a third button must not spill over the QR.
    flexWrap: 'wrap',
    marginTop: 24,
  },
  button: {
    backgroundColor: '#222222',
    borderWidth: 3,
    borderColor: '#555555',
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    marginRight: 16,
    marginBottom: 12,
  },
  buttonFocused: {
    backgroundColor: '#FFD400',
    borderColor: '#FFFFFF',
  },
  // Dimming to 0.4 is a contrast failure for exactly the users this app serves.
  buttonDisabled: {
    backgroundColor: '#111111',
    borderColor: '#767676',
    borderStyle: 'dashed',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '600',
  },
  buttonTextFocused: {
    color: '#000000',
  },
  waiting: {
    color: '#FFFFFF',
    marginBottom: 4,
  },
  error: {
    color: '#FF9A3C',
    fontWeight: '700',
    marginBottom: 4,
  },
  debug: {
    color: '#CCCCCC',
    fontSize: 20,
    marginTop: 16,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
  },
  qrPlaceholder: {
    width: 300,
    height: 300,
    backgroundColor: '#EEEEEE',
  },
});
