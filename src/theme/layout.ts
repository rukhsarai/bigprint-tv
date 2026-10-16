import {useMemo} from 'react';
import {Dimensions} from '@amazon-devices/react-native-kepler';

/** The size the screens are drawn at on the design canvas. */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/** Generous leading: large print for low vision needs air between lines. */
export const LINE_HEIGHT_RATIO = 1.4;

/**
 * How many layout units one design pixel is on this screen.
 *
 * Every size in the app is written in design pixels (a 1920 × 1080 frame).
 * If the TV reports a 1920 × 1080 window this is 1 and nothing changes. If it
 * reports a smaller logical window, as a density-2 screen does (960 × 540),
 * everything shrinks by the same factor, so the layout matches the drawing
 * instead of overflowing it. Text size choices multiply on top of this.
 */
export const designScale = (width: number, height: number): number => {
  if (!(width > 0) || !(height > 0)) {
    return 1;
  }
  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
};

export type TextType = {fontSize: number; lineHeight: number};

/** Font size and line height, in layout units, for a design-pixel font size. */
export const typeFor = (px: number, unit: number): TextType => {
  const fontSize = Math.max(1, Math.round(px * unit));
  return {fontSize, lineHeight: Math.round(fontSize * LINE_HEIGHT_RATIO)};
};

export type DesignUnits = {
  /** Layout units per design pixel. */
  unit: number;
  /** A design-pixel length in layout units. */
  dp: (px: number) => number;
  /**
   * Font size and line height for a design-pixel font size. Every text that
   * can wrap needs both: without a line height Vega measures a wrapped string
   * too short and clips its lower lines.
   */
  type: (px: number) => TextType;
};

/** Read once: a TV window does not change size while the app runs. */
export const useDesignUnits = (): DesignUnits =>
  useMemo(() => {
    const {width, height} = Dimensions.get('window');
    const unit = designScale(width, height);
    const dp = (px: number) => Math.round(px * unit);
    return {unit, dp, type: (px: number) => typeFor(px, unit)};
  }, []);
