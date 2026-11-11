import { useEffect, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { useMotionPaused } from './motion';
import { useTheme } from './theme';
import { TarotCard } from './tarot-card';
const positions = [
  { left: '4%', top: '9%', card: 0, angle: -18 },
  { left: '77%', top: '5%', card: 17, angle: 16 },
  { left: '91%', top: '42%', card: 18, angle: -12 },
  { left: '0%', top: '60%', card: 19, angle: 14 },
  { left: '20%', top: '84%', card: 1, angle: -14 },
  { left: '73%', top: '81%', card: 21, angle: 18 },
] as const;
export function TarotBackground() {
  const reduced = useMotionPaused();
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [drift, reduced]);
  return (
    <View
      testID="tarot-background"
      pointerEvents="none"
      aria-hidden={true}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      {positions.map((item, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: item.left,
            top: item.top,
            opacity: isDark ? 0.13 : 0.1,
            transform: [
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [i % 2 ? -12 : 12, i % 2 ? 16 : -16],
                }),
              },
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-5, 8] }) },
              {
                rotate: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${item.angle}deg`, `${item.angle + (i % 2 ? 5 : -5)}deg`],
                }),
              },
            ],
          }}
        >
          <TarotCard index={item.card} height={width < 700 ? 95 : 140} />
        </Animated.View>
      ))}
    </View>
  );
}
