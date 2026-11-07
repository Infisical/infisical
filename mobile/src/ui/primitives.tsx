import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text as RNText, TextStyle, View, ViewStyle } from "react-native";

import { Palette, size, space, type, usePalette } from "../theme/tokens";
import { Icon, IconName } from "./Icon";

type TextProps = {
  children: ReactNode;
  variant?: keyof typeof type;
  color?: keyof Palette;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export const Text = ({ children, variant = "body", color = "ink", style, numberOfLines }: TextProps) => {
  const palette = usePalette();
  return (
    <RNText numberOfLines={numberOfLines} style={[type[variant], { color: palette[color] }, style]}>
      {children}
    </RNText>
  );
};

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const Button = ({ label, onPress, variant = "primary", icon, busy, disabled, small, style }: ButtonProps) => {
  const palette = usePalette();
  const inactive = disabled || busy;
  const paint = {
    primary: { bg: palette.ink, pressed: palette.text2, border: palette.ink, fg: palette.onInk },
    accent: { bg: palette.accent, pressed: palette.accent2, border: palette.accent2, fg: palette.onAccent },
    secondary: { bg: "transparent", pressed: palette.press, border: palette.control, fg: palette.ink },
    ghost: { bg: "transparent", pressed: palette.press, border: "transparent", fg: palette.text2 }
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { height: small ? size.controlSm : size.controlLg, paddingHorizontal: small ? space[10] : space[16] },
        { backgroundColor: pressed ? paint.pressed : paint.bg, borderColor: paint.border },
        disabled && !busy && { opacity: 0.45 },
        style
      ]}
    >
      {({ pressed }) => (
        <View style={[styles.buttonLabel, pressed && { transform: [{ translateY: 1 }] }]}>
          {busy ? <ActivityIndicator size="small" color={paint.fg} /> : icon ? <Icon name={icon} size={16} color={paint.fg} /> : null}
          <Text variant="label" style={{ color: paint.fg, fontSize: small ? 13 : 15 }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

const toneColors = (palette: Palette, tone: Tone) =>
  ({
    neutral: { bg: palette.tint, fg: palette.text2, line: palette.lineSoft },
    ok: { bg: palette.okBg, fg: palette.ok, line: palette.okLine },
    warn: { bg: palette.warnBg, fg: palette.warn, line: palette.warnLine },
    bad: { bg: palette.badBg, fg: palette.bad, line: palette.badLine },
    info: { bg: palette.infoBg, fg: palette.info, line: palette.infoLine },
    accent: { bg: palette.accent, fg: palette.onAccent, line: palette.accent2 }
  })[tone];

export const Badge = ({ label, tone = "neutral" }: { label: string; tone?: Tone }) => {
  const palette = usePalette();
  const colors = toneColors(palette, tone);
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.line }]}>
      <Text variant="monoSm" style={{ color: colors.fg, fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
};

export const StatusText = ({ icon, label, tone }: { icon: IconName; label: string; tone: Tone }) => {
  const palette = usePalette();
  const colors = toneColors(palette, tone);
  return (
    <View style={styles.status}>
      <Icon name={icon} size={15} color={tone === "neutral" ? palette.muted : colors.fg} />
      <Text variant="label" style={{ color: tone === "neutral" ? palette.muted : colors.fg }}>
        {label}
      </Text>
    </View>
  );
};

export const Frame = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => {
  const palette = usePalette();
  return (
    <View style={[{ backgroundColor: palette.tint, padding: space[3] }, style]}>
      <View style={{ backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.line }}>{children}</View>
    </View>
  );
};

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <Text variant="eyebrow" color="muted">
    {children}
  </Text>
);

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonLabel: { flexDirection: "row", alignItems: "center", gap: space[8] },
  badge: {
    height: size.badge,
    paddingHorizontal: space[6],
    borderWidth: 1,
    justifyContent: "center",
    alignSelf: "flex-start"
  },
  status: { flexDirection: "row", alignItems: "center", gap: space[6] }
});
