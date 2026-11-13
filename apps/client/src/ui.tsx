import { Pressable, Text, TextInput } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { Children, type ReactNode, type Ref, type ComponentRef } from 'react';
import { ScrollView, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from './theme';

export function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  label,
  quiet = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  label?: string;
  quiet?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        minHeight: quiet ? 34 : 40,
        paddingHorizontal: quiet ? 10 : 16,
        paddingVertical: quiet ? 6 : 10,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        borderWidth: secondary && !quiet ? 1 : 0,
        borderColor: c.border,
        backgroundColor: quiet
          ? hovered
            ? c.hover
            : 'transparent'
          : secondary
            ? hovered
              ? c.hover
              : c.control
            : danger
              ? c.danger
              : c.accent,
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
      })}
    >
      {Children.toArray(children).every(
        (child) => typeof child === 'string' || typeof child === 'number',
      ) ? (
        <Text
          style={{
            fontWeight: '500',
            fontSize: quiet ? 13 : 14,
            color: quiet
              ? danger
                ? c.danger
                : c.muted
              : secondary
                ? c.text
                : danger
                  ? c.dangerText
                  : c.accentText,
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const { colors: c } = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={c.subtle}
      style={[
        {
          minHeight: 42,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: c.text,
          backgroundColor: c.surface,
          fontSize: 15,
        },
        props.style,
      ]}
    />
  );
}

export function Copy({
  children,
  muted = false,
  small = false,
  translate = true,
}: {
  children: ReactNode;
  muted?: boolean;
  small?: boolean;
  translate?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <Text
      translate={translate}
      style={{
        color: muted ? c.muted : c.text,
        fontSize: small ? 13 : 15,
        lineHeight: small ? 19 : 23,
      }}
    >
      {children}
    </Text>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const { colors: c } = useTheme();
  return error ? (
    <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 13, lineHeight: 20 }}>
      {error instanceof Error ? error.message : String(error)}
    </Text>
  ) : null;
}

export function Loading() {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.background,
        padding: 32,
      }}
    >
      <FoolSpinner size={32} />
    </View>
  );
}

export function Panel({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 16,
          backgroundColor: c.raised,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Page({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { colors: c } = useTheme();
  const router = useRouter();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: wide ? 1440 : 740,
        alignSelf: 'center',
        padding: 24,
        gap: 18,
        paddingBottom: 60,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Button secondary label="Back to conversations" onPress={() => router.replace('/')}>
          ← Back
        </Button>
        <Text style={{ fontSize: 22, fontWeight: '600', color: c.text }}>{title}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

export function Choice({
  children,
  selected,
  onPress,
  disabled = false,
  label,
}: {
  children: ReactNode;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: selected ? c.text : c.border,
        backgroundColor: selected ? c.selected : hovered ? c.hover : 'transparent',
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
      })}
    >
      <Text style={{ fontSize: 14, color: c.text, fontWeight: selected ? '600' : '500' }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function TabBar({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { colors: c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: c.border }}
      contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
    >
      {items.map((item) => (
        <Choice
          key={item.value}
          selected={item.value === value}
          onPress={() => onChange(item.value)}
        >
          {item.label}
        </Choice>
      ))}
    </ScrollView>
  );
}
