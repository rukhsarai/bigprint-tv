import React, {useState} from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityDescribedBy) are declared here.
import {Pressable, Text, View} from '@amazon-devices/react-native-kepler';

import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits} from '../theme/layout';
import {layout} from '../theme/styles';
import {CheckIcon} from './Icons';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** What VoiceView says, when it should say more than the label. */
  accessibilityLabel?: string;
  hasTVPreferredFocus?: boolean;
  /** Static text that can never take focus, linked so it is spoken here. */
  describedBy?: string[];
  testID: string;
  /** Drawn before the label, in the label's colour. */
  icon?: (color: string, size: number) => React.ReactNode;
  /** Label size in design pixels. Buttons keep their size at every text size. */
  fontPx?: number;
  /** One of a set of choices, and the one in use: a tick says so. */
  selected?: boolean;
};

/**
 * The one button every screen uses, so focus looks the same everywhere.
 *
 * Resting: a quiet fill with a solid edge. Focused: the whole button fills
 * with the theme's focus colour, the largest change the theme can make.
 * Disabled: a dashed edge and grey label that still pass contrast, never a
 * dimmed button.
 *
 * The edge is the same width in every state, so focus never shifts the row.
 */
export const TvButton = ({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  hasTVPreferredFocus,
  describedBy,
  testID,
  icon,
  fontPx = 28,
  selected,
}: Props) => {
  const [focused, setFocused] = useState(false);
  const {colours} = useColours();
  const {dp, type} = useDesignUnits();

  const fill = disabled
    ? colours.disabledFill
    : focused
    ? colours.focusFill
    : colours.buttonFill;
  const ink = disabled
    ? colours.disabledText
    : focused
    ? colours.focusText
    : colours.buttonText;
  const edge = focused
    ? colours.focusEdge
    : disabled
    ? colours.disabledEdge
    : colours.buttonEdge;
  const iconSize = dp(32);

  return (
    <Pressable
      accessible={true}
      // Not `disabled`: a disabled Pressable cannot take focus, so the D-pad
      // would skip it and a screen reader could never announce it.
      onPress={disabled ? undefined : onPress}
      accessibilityState={{disabled: !!disabled, selected}}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      role="button"
      aria-label={accessibilityLabel ?? label}
      accessibilityDescribedBy={describedBy}
      testID={testID}
      style={[
        layout.row,
        disabled && !focused ? layout.dashedEdge : layout.solidEdge,
        {
          height: dp(72),
          paddingHorizontal: dp(26),
          marginRight: dp(16),
          borderRadius: dp(10),
          borderWidth: dp(6),
          borderColor: edge,
          backgroundColor: fill,
        },
      ]}>
      {selected ? (
        <View style={{marginRight: dp(14)}}>
          <CheckIcon size={iconSize} color={ink} />
        </View>
      ) : icon ? (
        <View style={{marginRight: dp(14)}}>{icon(ink, iconSize)}</View>
      ) : null}
      <Text style={[layout.bold, {color: ink}, type(fontPx)]}>{label}</Text>
    </Pressable>
  );
};
