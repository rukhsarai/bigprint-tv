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

/** Where the phone sends the photo. Replace with the real capture URL. */
const CAPTURE_BASE_URL = 'https://bigprint.tv/scan';

type Props = {
  /** Owned by App, so the code stays stable across re-renders. */
  pairingCode: string;
  /** Set when the last attempt failed, so the user is told rather than left waiting. */
  error?: string | null;
};

export const PairingScreen = ({pairingCode, error}: Props) => {
  const {scale, scaled, restored, changeScale, canGoBigger, canGoSmaller} =
    useTextScale();

  return (
    <View style={styles.screen}>
      <View style={styles.left}>
        {/* Scrolls so the largest text sizes stay reachable instead of clipping. */}
        <ScrollView
          style={styles.textScroll}
          contentContainerStyle={styles.textScrollContent}
          showsVerticalScrollIndicator={false}>
          <Text role="heading" style={[styles.title, {fontSize: scaled(44)}]}>
            Read anything on your TV
          </Text>

          <Text style={[styles.body, {fontSize: scaled(24)}]}>
            1. Scan this code with your phone camera
          </Text>
          <Text style={[styles.body, {fontSize: scaled(24)}]}>
            2. Take a photo of any letter, bill or card
          </Text>
          <Text style={[styles.body, {fontSize: scaled(24)}]}>
            3. It appears here in large print
          </Text>

        </ScrollView>

        {/* Controls stay put so they are never scrolled off screen. */}
        <View style={styles.controls}>
          {/* role="alert" so the screen reader speaks it without needing focus,
              which it can never receive. */}
          {error ? (
            <Text
              role="alert"
              style={[styles.error, {fontSize: scaled(24)}]}
              testID="pairing-error">
              {error}
            </Text>
          ) : (
            <Text
              style={[styles.waiting, {fontSize: scaled(24)}]}
              testID="pairing-waiting">
              Waiting for your photo…
            </Text>
          )}
          <TVFocusGuideView style={styles.buttonRow}>
            <SizeButton
              label="Bigger text"
              onPress={() => changeScale(1)}
              disabled={!canGoBigger}
              hasTVPreferredFocus
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
        {/* The QR carries information, so it needs a spoken equivalent:
            a screen reader user cannot scan it and needs the code instead. */}
        <View
          style={styles.qrFrame}
          nativeID="pairing-qr"
          accessible={true}
          aria-label={`Scan code to send a photo. Or enter code ${pairingCode
            .split('')
            .join(' ')} on bigprint.tv`}>
          <QRCode
            value={`${CAPTURE_BASE_URL}?code=${pairingCode}`}
            size={300}
            ecl="M"
          />
        </View>
        <Text nativeID="pairing-code-label" style={styles.codeLabel}>
          Or enter this code on bigprint.tv
        </Text>
        <Text nativeID="pairing-code" style={styles.code}>
          {pairingCode}
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
};

const SizeButton = ({
  label,
  onPress,
  disabled,
  hasTVPreferredFocus,
}: SizeButtonProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessible={true}
      onPress={onPress}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      role="button"
      aria-label={label}
      aria-disabled={!!disabled}
      // The pairing code can never take focus, so link it to the first control.
      accessibilityDescribedBy={
        hasTVPreferredFocus
          ? ['pairing-code-label', 'pairing-code']
          : undefined
      }
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
    marginBottom: 32,
  },
  body: {
    color: '#FFFFFF',
    marginBottom: 12,
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
    letterSpacing: 8,
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
});
