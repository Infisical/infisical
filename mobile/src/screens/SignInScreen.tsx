import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_INSTANCE_URL, normalizeInstanceUrl } from "../auth/config";
import { useSession } from "../auth/session";
import { font, space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { Button, Eyebrow, Frame, Text } from "../ui/primitives";

export const SignInScreen = ({ notice, lastInstance }: { notice?: string; lastInstance?: string }) => {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { signIn, startDemo } = useSession();
  const [address, setAddress] = useState(lastInstance ?? DEFAULT_INSTANCE_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const normalized = normalizeInstanceUrl(address);
    if ("error" in normalized) return setError(normalized.error);
    setAddress(normalized.url);
    setError(null);
    setBusy(true);
    try {
      await signIn(normalized.url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign-in didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.inset }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[40], paddingBottom: insets.bottom + space[24] }]}
      >
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: palette.accent }]}>
            <Text variant="label" style={{ color: palette.onAccent, fontSize: 18 }}>
              I
            </Text>
          </View>
          <Text variant="titleSm">Infisical</Text>
        </View>

        <View style={{ gap: space[8] }}>
          <Text variant="titleLg">Sign in to review requests</Text>
          <Text variant="body" color="muted">
            Approve or deny access requests from your phone. You sign in through your browser, so your password never touches the app.
          </Text>
        </View>

        {notice && (
          <Frame>
            <View style={styles.notice}>
              <Icon name="info" size={16} color={palette.info} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {notice}
              </Text>
            </View>
          </Frame>
        )}

        <View style={{ gap: space[8] }}>
          <Eyebrow>Infisical URL</Eyebrow>
          <TextInput
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              if (error) setError(null);
            }}
            onSubmitEditing={submit}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            accessibilityLabel="Infisical URL"
            placeholder={DEFAULT_INSTANCE_URL}
            placeholderTextColor={palette.faint}
            style={[
              styles.input,
              { borderColor: error ? palette.bad : palette.control, color: palette.ink, backgroundColor: palette.surface }
            ]}
          />
          {error ? (
            <View style={styles.error} accessibilityRole="alert">
              <Icon name="alert" size={16} color={palette.bad} />
              <Text variant="bodySm" color="bad" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : (
            <Text variant="bodySm" color="muted">
              Self-hosting? Enter your instance's address, like infisical.example.com.
            </Text>
          )}
          <Button label={busy ? "Opening browser…" : "Continue"} busy={busy} onPress={submit} style={{ marginTop: space[8] }} />
        </View>

        <View style={[styles.divider, { borderTopColor: palette.line }]}>
          <View style={{ gap: space[4] }}>
            <Text variant="titleSm">Just looking?</Text>
            <Text variant="bodySm" color="muted">
              The demo runs on sample requests stored on this phone. Nothing reaches Infisical.
            </Text>
          </View>
          <Button variant="secondary" label="Try the demo" disabled={busy} onPress={() => void startDemo()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: space[20], gap: space[24] },
  brand: { flexDirection: "row", alignItems: "center", gap: space[10] },
  mark: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", gap: space[8], padding: space[12] },
  input: { height: 48, borderWidth: 1, paddingHorizontal: space[12], fontFamily: font.mono, fontSize: 15 },
  error: { flexDirection: "row", gap: space[8] },
  divider: { borderTopWidth: 1, paddingTop: space[24], gap: space[12] }
});
