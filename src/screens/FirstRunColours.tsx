import React, {useState} from 'react';
// Vega's components, not stock react-native: the Fire TV accessibility props
// (accessibilityOrientationText) are declared here.
import {
  Pressable,
  Text,
  TVFocusGuideView,
  View,
} from '@amazon-devices/react-native-kepler';

import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits, type TextType} from '../theme/layout';
import {COLOURS, COLOURS_ORDER, type Colours} from '../theme/colours';
import {InfoIcon} from '../components/Icons';
import {layout} from '../theme/styles';

/**
 * Asked once, before anything else. Which polarity reads best differs from
 * person to person, even within one eye condition, so the viewer chooses
 * instead of the app guessing. Each tile shows a real sentence in its own
 * colours, so the choice is made by reading, not by name.
 */
export const FirstRunColours = () => {
  // The page itself is in the default look until a choice is made.
  const {colours: page, choose} = useColours();
  const {dp, type} = useDesignUnits();

  return (
    <View
      style={[
        layout.fill,
        {
          backgroundColor: page.background,
          paddingHorizontal: dp(96),
          paddingVertical: dp(54),
        },
      ]}
      accessibilityOrientationText={
        'Choose how BigPrint looks. Press left and right to compare dark, ' +
        'light, and yellow on black, then press select on the one that is ' +
        'easiest to read. You can change it later with the Colors button.'
      }>
      <Text role="heading" style={[layout.bold, {color: page.text}, type(52)]}>
        Which is easier to read?
      </Text>
      <Text style={[{color: page.text, marginTop: dp(8)}, type(30)]}>
        Choose with Left and Right, then press Select. You can change it any
        time with the Colors button.
      </Text>

      <TVFocusGuideView
        style={[
          layout.fillRow,
          {
            marginTop: dp(28),
            marginHorizontal: -dp(20),
          },
        ]}>
        {COLOURS_ORDER.map((name, index) => (
          <Tile
            key={name}
            option={COLOURS[name]}
            page={page}
            position={`${index + 1} of ${COLOURS_ORDER.length}`}
            onPress={() => choose(name)}
            hasTVPreferredFocus={index === 0}
            dp={dp}
            type={type}
          />
        ))}
      </TVFocusGuideView>

      <View
        style={[
          layout.row,
          {
            marginTop: dp(16),
            paddingVertical: dp(20),
            paddingHorizontal: dp(28),
            borderRadius: dp(14),
            borderWidth: dp(4),
            borderColor: page.cardEdge,
          },
        ]}>
        <View style={{marginRight: dp(24)}}>
          <InfoIcon size={dp(40)} color={page.text} />
        </View>
        <Text style={[layout.fill, {color: page.text}, type(28)]}>
          Not sure? Pick the one where the letters look sharpest, not the one
          that looks nicest.
        </Text>
      </View>
    </View>
  );
};

const Tile = ({
  option,
  page,
  position,
  onPress,
  hasTVPreferredFocus,
  dp,
  type,
}: {
  option: Colours;
  page: Colours;
  position: string;
  onPress: () => void;
  hasTVPreferredFocus: boolean;
  dp: (px: number) => number;
  type: (px: number) => TextType;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[layout.fill, layout.column, {marginHorizontal: dp(20)}]}>
      {/* A grey edge round every tile, so the dark tiles show on a dark page. */}
      <View
        style={{
          borderWidth: dp(4),
          borderColor: page.cardEdge,
          borderRadius: dp(24),
        }}>
        <Pressable
          accessible={true}
          role="button"
          aria-label={`${option.label}. ${option.description} ${position}.`}
          testID={`colours-${option.name}`}
          hasTVPreferredFocus={hasTVPreferredFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPress={onPress}
          style={[
            layout.spread,
            {
              height: dp(440),
              paddingHorizontal: dp(32),
              paddingVertical: dp(28),
              borderRadius: dp(20),
              borderWidth: dp(14),
              borderColor: focused ? page.focus : option.background,
              backgroundColor: option.background,
            },
          ]}>
          <Text style={[{color: option.text}, type(44)]}>
            Your electricity bill is{' '}
            <Text style={[layout.bold, {color: option.keyFigure}]}>42.50</Text>,
            due November 3.
          </Text>
          <Text style={[layout.bold, {color: option.text}, type(34)]}>
            {option.label}
          </Text>
        </Pressable>
      </View>
      <Text style={[{color: page.text, marginTop: dp(18)}, type(26)]}>
        {option.description}
      </Text>
    </View>
  );
};
