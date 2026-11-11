import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from './theme';
import { useReducedMotion } from './motion';
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const colors = ['#8ab4f8', '#b69df8', '#e9a3c9', '#f4c789', '#a8d8b9', '#8ab4f8'];
export function ComposerFrame({ focused, children }: { focused: boolean; children: ReactNode }) {
  const { colors: c } = useTheme();
  const reduced = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (Platform.OS === 'web' || reduced) return;
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      phase.setValue(0);
    };
  }, [focused, reduced, phase]);
  const perimeter = 2 * (size.width + size.height) - 8 * 28 + 2 * Math.PI * 28;
  return (
    <View
      testID="composer-frame"
      onLayout={(event) => {
        if (Platform.OS !== 'web') setSize(event.nativeEvent.layout);
      }}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 28,
        backgroundColor: c.composer,
        padding: 16,
        gap: 12,
      }}
    >
      {children}
      {Platform.OS !== 'web' && size.width > 0 && (
        <Svg
          pointerEvents="none"
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          aria-hidden={true}
          focusable={false}
        >
          {colors.map((color, index) => (
            <AnimatedRect
              key={index}
              x={0.75}
              y={0.75}
              width={size.width - 1.5}
              height={size.height - 1.5}
              rx={27}
              fill="none"
              stroke={color}
              strokeWidth={focused ? 1.8 : 1.3}
              strokeDasharray={[perimeter / 6, (perimeter * 5) / 6]}
              strokeDashoffset={phase.interpolate({
                inputRange: [0, 1],
                outputRange: [(-index * perimeter) / 6, (-(index + 6) * perimeter) / 6],
              })}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
