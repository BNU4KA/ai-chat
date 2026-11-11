import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';
import { useMotionPaused } from './motion';
import { TarotCard } from './tarot-card';
import { useLocale } from './locale';
export function FoolSpinner({
  size = 40,
  label = 'Loading',
  style,
}: {
  size?: number;
  label?: string;
  style?: ViewStyle;
}) {
  const reduced = useMotionPaused();
  const { t } = useLocale();
  const [card, setCard] = useState(0);
  const phase = useRef(new Animated.Value(0)).current;
  useLayoutEffect(() => {
    phase.setValue(0);
  }, [card, phase, reduced]);
  useEffect(() => {
    if (reduced) return;
    let active = true;
    const animation = Animated.sequence([
      Animated.delay(1600),
      Animated.timing(phase, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && active) {
        setCard((value) => (value + 1) % 22);
      }
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [card, phase, reduced]);
  return (
    <View
      testID="fool-spinner"
      accessibilityRole="progressbar"
      accessibilityLabel={t(label)}
      style={[
        { width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          width: size * 0.72,
          height: size,
          borderRadius: 4,
          backgroundColor: '#bd9b55',
          opacity: 0.22,
          transform: [{ rotate: '-9deg' }, { translateX: -3 }],
        }}
      />
      <Animated.View
        testID="tarot-current"
        style={{
          opacity: phase.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1, 0] }),
          transform: [
            {
              translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.18] }),
            },
            { rotate: phase.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-9deg'] }) },
          ],
        }}
      >
        <TarotCard index={card} height={size} />
      </Animated.View>
      {!reduced && (
        <Animated.View
          testID="tarot-next"
          style={{
            position: 'absolute',
            opacity: phase.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0, 1] }),
            transform: [
              {
                translateX: phase.interpolate({
                  inputRange: [0, 1],
                  outputRange: [size * 0.18, 0],
                }),
              },
              { rotate: phase.interpolate({ inputRange: [0, 1], outputRange: ['9deg', '0deg'] }) },
            ],
          }}
        >
          <TarotCard index={(card + 1) % 22} height={size} />
        </Animated.View>
      )}
    </View>
  );
}
