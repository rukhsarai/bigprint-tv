import {StyleSheet} from '@amazon-devices/react-native-kepler';

/**
 * The static half of every style. Sizes and colours depend on the window and
 * the viewer's look, so they are computed per render; everything that does
 * not change lives here, so it is created once.
 */
export const layout = StyleSheet.create({
  fill: {flex: 1},
  fillRow: {flex: 1, flexDirection: 'row'},
  row: {flexDirection: 'row', alignItems: 'center'},
  rowWrap: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'},
  baselineRow: {flexDirection: 'row', alignItems: 'baseline'},
  wrap: {flexDirection: 'row', flexWrap: 'wrap'},
  plainRow: {flexDirection: 'row'},
  centre: {alignItems: 'center', justifyContent: 'center'},
  spread: {justifyContent: 'space-between'},
  startSelf: {alignSelf: 'flex-start'},
  shrink: {flexShrink: 1},
  column: {minWidth: 0},
  bold: {fontWeight: '700'},
  solidEdge: {borderStyle: 'solid'},
  dashedEdge: {borderStyle: 'dashed'},
  regular: {fontWeight: '400'},
  textCentre: {textAlign: 'center'},
  // The QR code is always black on white, whatever the look: scanners need it.
  qrPaper: {backgroundColor: '#FFFFFF'},
  qrPlaceholder: {backgroundColor: '#EEEEEE'},
});
