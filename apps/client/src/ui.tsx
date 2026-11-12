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
        minHeight: quiet ? 36 : 44,
        paddingHorizontal: quiet ? 10 : 16,
        paddingVertical: quiet ? 8 : 11,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
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
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
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
      placeholderTextColor={c.muted}
      style={[
        {
          minHeight: 46,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 24,
          padding: 12,
          color: c.text,
          backgroundColor: c.surface,
          fontSize: 16,
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
        fontSize: small ? 13 : 16,
        lineHeight: small ? 20 : 25,
      }}
    >
      {children}
    </Text>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  const { colors: c } = useTheme();
  return error ? (
    <Text accessibilityRole="alert" style={{ color: c.danger, lineHeight: 22 }}>
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
      <FoolSpinner size={56} />
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
          padding: 20,
          gap: 14,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 24,
          backgroundColor: c.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Page({ title, children }: { title: string; children: ReactNode }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
        padding: 24,
        gap: 20,
        paddingBottom: 60,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Button secondary label="Back to conversations" onPress={() => router.replace('/')}>
          ← Back
        </Button>
        <Text style={{ fontSize: 25, fontWeight: '700', color: c.text }}>{title}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

/** The same outlined selection treatment used in Settings. */
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
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.selected : hovered ? c.hover : 'transparent',
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ fontSize: 14, color: c.text, fontWeight: '500' }}>{children}</Text>
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
