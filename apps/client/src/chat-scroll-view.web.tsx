import { forwardRef } from 'react';
import { ScrollView } from 'react-native';
import type {
  KeyboardChatScrollViewProps,
  KeyboardChatScrollViewRef,
} from 'react-native-keyboard-controller';

export const ChatScrollView = forwardRef<KeyboardChatScrollViewRef, KeyboardChatScrollViewProps>(
  function ChatScrollView(
    {
      keyboardLiftBehavior: _lift,
      offset: _offset,
      extraContentPadding: _padding,
      onEndVisible: _end,
      ...props
    },
    ref,
  ) {
    return <ScrollView ref={ref} {...props} />;
  },
);
