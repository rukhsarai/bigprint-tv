import React, {useEffect, useState} from 'react';
import {
  BackHandler,
  ScrollView,
  Text,
  TVFocusGuideView,
  View,
} from '@amazon-devices/react-native-kepler';

import type {ScannedDocument} from '../data/documents';
import {
  KEEP_DAYS,
  letterTitle,
  whenSeen,
  type RecentLetter,
} from '../hooks/useRecentLetters';
import {useColours} from '../theme/ColoursProvider';
import {useDesignUnits} from '../theme/layout';
import {layout} from '../theme/styles';
import {TvButton} from '../components/TvButton';

type Props = {
  letters: RecentLetter[];
  onOpen: (document: ScannedDocument) => void;
  onClose: () => void;
  onDeleteAll: () => void;
  now?: number;
};

/**
 * The last letters read on this TV, newest first, so a page left by mistake
 * comes back with one press instead of another photo. Everything here is on
 * the TV already; opening a letter sends nothing.
 */
export const RecentLetters = ({
  letters,
  onOpen,
  onClose,
  onDeleteAll,
  now,
}: Props) => {
  const {colours} = useColours();
  const {dp, type} = useDesignUnits();
  // Deleting is the one thing here that cannot be undone, so it asks once.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirming) {
        setConfirming(false);
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [confirming, onClose]);

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
        'Recent letters, newest first. Press up and down to choose one and ' +
        'select to read it again. Nothing is sent again.'
      }>
      <Text
        role="heading"
        style={[layout.bold, {color: colours.text}, type(44)]}>
        Recent letters
      </Text>
      <Text
        style={[{color: colours.textSecondary, marginTop: dp(8)}, type(26)]}>
        {`Kept on this TV for ${
          KEEP_DAYS === 1 ? 'a day' : `${KEEP_DAYS} days`
        }. Opening one sends nothing again.`}
      </Text>

      <ScrollView
        style={[layout.fill, {marginTop: dp(24)}]}
        contentContainerStyle={{paddingBottom: dp(16)}}
        showsVerticalScrollIndicator={false}>
        <TVFocusGuideView>
          {letters.length === 0 ? (
            <Text style={[{color: colours.text}, type(30)]}>
              No letters yet.
            </Text>
          ) : (
            letters.map((letter, index) => (
              <View key={letter.document.id} style={{marginBottom: dp(14)}}>
                <TvButton
                  label={`${letterTitle(letter.document)}  ·  ${whenSeen(
                    letter.seenAt,
                    now,
                  )}`}
                  accessibilityLabel={`${letterTitle(
                    letter.document,
                  )}, ${whenSeen(letter.seenAt, now)}. Press to read it again.`}
                  onPress={() => onOpen(letter.document)}
                  hasTVPreferredFocus={index === 0}
                  testID={`recent-${index}`}
                  fontPx={30}
                />
              </View>
            ))
          )}
        </TVFocusGuideView>
      </ScrollView>

      <TVFocusGuideView style={[layout.row, {marginTop: dp(12)}]}>
        {confirming ? (
          <>
            <TvButton
              label="Yes, delete them all"
              onPress={() => {
                setConfirming(false);
                onDeleteAll();
              }}
              hasTVPreferredFocus={true}
              testID="control-Confirm delete"
            />
            <TvButton
              label="No, keep them"
              onPress={() => setConfirming(false)}
              testID="control-Keep"
            />
          </>
        ) : (
          <>
            <TvButton
              label="Back"
              onPress={onClose}
              hasTVPreferredFocus={letters.length === 0}
              testID="control-Back"
            />
            {letters.length > 0 && (
              <TvButton
                label="Delete all"
                accessibilityLabel="Delete all recent letters from this TV."
                onPress={() => setConfirming(true)}
                testID="control-Delete all"
              />
            )}
          </>
        )}
      </TVFocusGuideView>
    </View>
  );
};
