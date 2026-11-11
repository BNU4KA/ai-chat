import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {
  Text as NativeText,
  Pressable as NativePressable,
  TextInput as NativeInput,
  type TextProps,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import { useLocale } from './locale';
export function Text({
  children,
  translate = true,
  ...props
}: TextProps & { translate?: boolean }) {
  const { t } = useLocale();
  const localize = (child: ReactNode): ReactNode =>
    typeof child === 'string' ? t(child) : Array.isArray(child) ? child.map(localize) : child;
  return (
    <NativeText
      {...props}
      accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}
    >
      {translate ? localize(children) : children}
    </NativeText>
  );
}
export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps>(
  function LocalizedPressable(props, ref) {
    const { t } = useLocale();
    return (
      <NativePressable
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}
        accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined}
      />
    );
  },
);
export const TextInput = forwardRef<ComponentRef<typeof NativeInput>, TextInputProps>(
  function LocalizedInput(props, ref) {
    const { t } = useLocale();
    return (
      <NativeInput
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}
        placeholder={props.placeholder ? t(props.placeholder) : undefined}
      />
    );
  },
);
