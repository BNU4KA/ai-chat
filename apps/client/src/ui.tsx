import { Pressable, Text, TextInput } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import type { ReactNode, Ref, ComponentRef } from 'react';
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
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  label?: string;
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
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 24,
        borderWidth: secondary ? 1 : 2,
        borderColor: danger ? c.danger : c.cardEdge,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: danger ? c.danger : pressed || hovered ? c.cardPressed : c.card,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {typeof children === 'string' ? (
        <Text
          style={{
            fontWeight: '600',
            fontSize: 14,
            color: danger ? c.dangerText : c.cardInk,
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
