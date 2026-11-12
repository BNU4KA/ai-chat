import { Pressable, Text, TextInput } from './locale-ui';
import { Children, type ReactNode, type Ref, type ComponentRef } from 'react';
import { ScrollView, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { AppSkeleton } from './skeleton';
import { radii, spacing, typography, useTheme } from './theme';
export function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  label,
  quiet = false,
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  label?: string;
  quiet?: boolean;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        minHeight: quiet ? 32 : 40,
        paddingHorizontal: quiet ? spacing.sm : spacing.lg,
        paddingVertical: quiet ? spacing.xs : spacing.sm,
        borderRadius: radii.md,
        borderWidth: secondary ? 1 : 0,
        borderColor: danger ? c.danger : c.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          secondary
            ? hovered || pressed
              ? c.hover
              : c.surface
            : quiet
              ? hovered || pressed
                ? c.hover
                : 'transparent'
            : danger
              ? c.danger
              : hovered || pressed
                ? c.text
                : c.accent,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {Children.toArray(children).every(
        (child) => typeof child === 'string' || typeof child === 'number',
      ) ? (
        <Text
          style={{
            fontWeight: '600',
            fontSize: typography.body,
            color: quiet
              ? danger
                ? c.danger
                : c.text
              : danger
                ? c.dangerText
                : secondary
                  ? c.text
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
export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed, hovered }) => ({
        width: 36,
        height: 36,
        borderRadius: radii.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered || pressed ? c.hover : 'transparent',
      })}
    >
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text style={{ color: c.text, fontSize: 18, lineHeight: 22 }}>{children}</Text>
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
          borderRadius: radii.md,
          padding: spacing.md,
          color: c.text,
          backgroundColor: c.surface,
          fontSize: typography.input,
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
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: c.danger,
        borderRadius: radii.lg,
        backgroundColor: c.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: c.danger, lineHeight: 22 }}>
        {error instanceof Error ? error.message : String(error)}
      </Text>
    </View>
  ) : null;
}
export function Loading() {
  return <AppSkeleton />;
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
          padding: spacing.lg,
          gap: spacing.md,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radii.lg,
          backgroundColor: c.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function PanelRedirect({ panel }: { panel: string }) {
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const document = Array.isArray(params.document) ? params.document[0] : params.document;
  return (
    <Redirect href={{ pathname: '/', params: document ? { panel, document } : { panel } }} />
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
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 0,
        backgroundColor: selected ? c.selected : hovered || pressed ? c.hover : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text style={{ fontSize: 13, color: c.text, fontWeight: '500' }}>{children}</Text>
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6 }}
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
