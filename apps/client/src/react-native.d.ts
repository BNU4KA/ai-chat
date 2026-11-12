import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    readonly hovered?: boolean;
  }

  interface ViewStyle {
    transitionProperty?: string;
    transitionDuration?: string;
    transitionTimingFunction?: string;
  }
}
