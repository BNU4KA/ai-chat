import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Text } from './locale-ui';
import { useMotionPaused } from './motion';
import { useTheme } from './theme';
import { Button } from './ui';

interface ConversationMissingProps {
  onBack: () => void;
}

export function ConversationMissing({ onBack }: ConversationMissingProps) {
  const { colors: c, isDark } = useTheme();
  const paused = useMotionPaused();
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.55)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  useEffect(() => {
    if (paused) {
      float.stopAnimation();
      pulse.stopAnimation();
      float.setValue(0);
      pulse.setValue(0.55);
      return;
    }
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    bob.start();
    glow.start();
    return () => {
      bob.stop();
      glow.stop();
    };
  }, [paused, float, pulse]);

  const ink = isDark ? '#9ec5ff' : '#3b6ea5';
  const inkSoft = isDark ? 'rgba(158, 197, 255, 0.18)' : 'rgba(59, 110, 165, 0.14)';
  const bubble = isDark ? '#3a4558' : '#d7e6f5';
  const crack = isDark ? '#f87171' : '#dc2626';

  return (
    <Animated.View
      testID="conversation-missing"
      accessibilityRole="alert"
      style={{
        paddingVertical: 48,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 18,
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      <View
        style={{
          width: 220,
          height: 168,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: inkSoft,
            opacity: pulse,
            transform: [{ scale: pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.88, 1.08] }) }],
          }}
        />
        <Animated.View
          testID="missing-chat-art"
          style={{
            transform: [
              {
                translateY: float.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -8],
                }),
              },
              {
                rotate: float.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-3deg', '3deg'],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              width: 118,
              height: 86,
              borderRadius: 22,
              backgroundColor: bubble,
              borderWidth: 2,
              borderColor: ink,
              justifyContent: 'center',
              paddingHorizontal: 18,
              gap: 10,
              ...(Platform.OS === 'web'
                ? { boxShadow: isDark ? '0 12px 28px rgba(0,0,0,0.35)' : '0 10px 24px rgba(59,110,165,0.18)' }
                : {}),
            }}
          >
            <View style={{ height: 8, width: '72%', borderRadius: 4, backgroundColor: ink, opacity: 0.55 }} />
            <View style={{ height: 8, width: '48%', borderRadius: 4, backgroundColor: ink, opacity: 0.35 }} />
            <View
              style={{
                position: 'absolute',
                right: -2,
                top: 18,
                width: 3,
                height: 52,
                borderRadius: 2,
                backgroundColor: crack,
                transform: [{ rotate: '12deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 28,
                bottom: -14,
                width: 0,
                height: 0,
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderTopWidth: 16,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: bubble,
              }}
            />
          </View>
          <Text
            translate={false}
            style={{
              marginTop: 18,
              textAlign: 'center',
              fontSize: 42,
              fontWeight: '800',
              letterSpacing: 4,
              color: ink,
            }}
          >
            404
          </Text>
        </Animated.View>
      </View>

      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: c.text,
          letterSpacing: -0.3,
          textAlign: 'center',
        }}
      >
        Conversation missing
      </Text>
      <Text
        style={{
          fontSize: 15,
          lineHeight: 22,
          color: c.muted,
          textAlign: 'center',
          maxWidth: 340,
        }}
      >
        This chat wandered off or is temporarily unavailable. Pick another conversation and keep going.
      </Text>
      <Button onPress={onBack}>Back to conversations</Button>
    </Animated.View>
  );
}
