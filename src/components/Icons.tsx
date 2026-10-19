import React from 'react';
import {View} from '@amazon-devices/react-native-kepler';
// The same import name the QR library uses. Importing the package under its
// other name too would load a second copy, which registers every SVG view twice
// and crashes at start-up.
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';

type IconProps = {
  size: number;
  color: string;
};

/**
 * Line icons from the design canvas. Every icon here sits next to words that
 * say the same thing, so they are decoration and hidden from the screen
 * reader; the words are what VoiceView reads.
 */
const Hidden = ({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) => (
  <View
    accessible={false}
    aria-hidden={true}
    importantForAccessibility="no-hide-descendants"
    style={{width: size, height: size}}>
    {children}
  </View>
);

export const PhoneIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Rect
        x={16}
        y={4}
        width={24}
        height={48}
        rx={5}
        stroke={color}
        strokeWidth={3}
      />
      <Line
        x1={24}
        y1={44}
        x2={32}
        y2={44}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line
        x1={22}
        y1={10}
        x2={34}
        y2={10}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  </Hidden>
);

export const CameraIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Path
        d="M8 18h9l4-6h14l4 6h9v28H8z"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Circle cx={28} cy={31} r={8} stroke={color} strokeWidth={3} />
    </Svg>
  </Hidden>
);

export const TvIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Rect
        x={6}
        y={10}
        width={44}
        height={30}
        rx={4}
        stroke={color}
        strokeWidth={3}
      />
      <Line
        x1={20}
        y1={48}
        x2={36}
        y2={48}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Line x1={28} y1={40} x2={28} y2={48} stroke={color} strokeWidth={3} />
      <Path
        d="M18 30c6-6 14-6 20 0"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M23 25c3-3 7-3 10 0"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  </Hidden>
);

export const CheckIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path
        d="M8 21l8 8 16-18"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  </Hidden>
);

export const WarningIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 4L3 27h26z"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Line
        x1={16}
        y1={12}
        x2={16}
        y2={19}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={16} cy={23} r={1.5} fill={color} />
    </Svg>
  </Hidden>
);

export const SpeakerIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M4 12h6l8-7v22l-8-7H4z"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M22 11c3 3 3 7 0 10"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M25 7c5 5 5 13 0 18"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  </Hidden>
);

export const InfoIcon = ({size, color}: IconProps) => (
  <Hidden size={size}>
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={16} stroke={color} strokeWidth={3} />
      <Line
        x1={20}
        y1={18}
        x2={20}
        y2={28}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={20} cy={12} r={1.5} fill={color} />
    </Svg>
  </Hidden>
);
