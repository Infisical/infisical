import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ago, summary, timeLeft, typeIcon, typeLabel } from "../data/format";
import { useStore } from "../data/store";
import { ApprovalStep } from "../data/types";
import { font, space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { Badge, Button, Eyebrow, Frame, StatusText, Text } from "../ui/primitives";
import { confirmWithDevice, decisionHaptic } from "./decide";
import { statusMeta } from "./RequestRow";

const Fact = ({ label, value, mono, isLast }: { label: string; value: string; mono?: boolean; isLast?: boolean }) => {
  const palette = usePalette();
  return (
    <View style={[styles.fact, !isLast && { borderBottomWidth: 1, borderBottomColor: palette.lineSoft }]}>
      <Text variant="bodySm" color="muted" style={styles.factLabel}>
        {label}
      </Text>
      <Text variant={mono ? "mono" : "body"} style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
};

const stepStatus = (step: ApprovalStep) => {
  if (step.status === "approved") return { icon: "check-c" as const, label: `Approved by ${step.decidedBy}`, tone: "ok" as const };
  if (step.status === "rejected") return { icon: "x" as const, label: `Denied by ${step.decidedBy}`, tone: "bad" as const };
  if (step.status === "current")
    return { icon: "clock" as const, label: `Needs ${step.required} of ${step.approvers.length}`, tone: "warn" as const };
  return { icon: "clock" as const, label: "Not reached", tone: "neutral" as const };
};

export const RequestDetailScreen = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { requests, activity, decide, undo, resolvedThisSession } = useStore();
  const [comment, setComment] = useState("");
  const request = requests.find((candidate) => candidate.id === id);
  if (!request) return null;

  const current = activity[request.id] ?? { state: "idle" };
  const failed = current.state === "failed" ? current : null;
  const resolved = request.status !== "pending";
  const canDecide = request.awaitingYou && !resolved;

  const run = async (action: "approve" | "deny") => {
    if (action === "approve" && !(await confirmWithDevice(`Approve ${request.resource}`))) return;
    if (!(await decide(request.id, action, comment.trim()))) return;
    setComment("");
    decisionHaptic(action);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.topBar, { borderBottomColor: palette.line }]}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" style={styles.back}>
          <Icon name="chev-left" size={20} color={palette.ink} />
          <Text variant="label">Back</Text>
        </Pressable>
        <Text variant="monoSm" color="muted">
          {request.id.slice(0, 8)}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: space[8] }}>
          <View style={styles.eyebrowLine}>
            <Icon name={typeIcon[request.type]} size={14} color={palette.muted} />
            <Eyebrow>{typeLabel[request.type]} request</Eyebrow>
          </View>
          <Text variant="title" style={{ fontFamily: font.monoMedium }}>
            {request.resource}
          </Text>
          <Text variant="body" color="text2">
            Requested by {request.requesterName}, {ago(request.createdAt)} ago
          </Text>
          <View style={styles.badges}>
            <Badge label={request.environment} tone={request.isProduction ? "warn" : "neutral"} />
            <Badge label={request.projectName} />
          </View>
        </View>

        <Frame>
          <View style={styles.reason}>
            <Eyebrow>Reason</Eyebrow>
            <Text variant="body">{request.reason}</Text>
          </View>
        </Frame>

        <View style={{ gap: space[8] }}>
          <Eyebrow>Details</Eyebrow>
          <Frame>
            <Fact label="Requested by" value={`${request.requesterName}\n${request.requesterEmail}`} />
            <Fact label="Resource" value={request.resource} mono />
            <Fact label="Location" value={request.location} mono />
            <Fact label="Access" value={summary(request)} />
            <Fact label="Policy" value={request.policyName} />
            <Fact label="Request expires" value={resolved ? "Closed" : timeLeft(request.expiresAt)} isLast />
          </Frame>
        </View>

        <View style={{ gap: space[8] }}>
          <Eyebrow>Approval steps</Eyebrow>
          <Frame>
            {request.steps.map((step, index) => (
              <View
                key={step.name}
                style={[styles.step, index < request.steps.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.lineSoft }]}
              >
                <Text variant="monoSm" color="muted">
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1, gap: space[4] }}>
                  <Text variant="label">{step.name}</Text>
                  <Text variant="bodySm" color="muted">
                    {step.approvers.join(", ")}
                  </Text>
                  <StatusText {...stepStatus(step)} />
                </View>
              </View>
            ))}
          </Frame>
        </View>

        {request.decision?.comment && (
          <Frame>
            <View style={styles.reason}>
              <Eyebrow>Comment from {request.decision.by}</Eyebrow>
              <Text variant="body">{request.decision.comment}</Text>
            </View>
          </Frame>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: palette.paper, borderTopColor: palette.line, paddingBottom: insets.bottom + space[12] }]}>
        {canDecide ? (
          <>
            {failed && (
              <View style={[styles.error, { backgroundColor: palette.badWash, borderColor: palette.badLine }]} accessibilityRole="alert">
                <Icon name="alert" size={16} color={palette.bad} />
                <Text variant="bodySm" color="bad" style={{ flex: 1 }}>
                  {failed.error}
                </Text>
              </View>
            )}
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor={palette.muted}
              style={[styles.input, { borderColor: palette.control, color: palette.ink, backgroundColor: palette.surface }]}
            />
            <View style={styles.footerButtons}>
              <Button
                variant="secondary"
                label={current.state === "denying" ? "Denying…" : failed?.action === "deny" ? "Retry" : "Deny"}
                busy={current.state === "denying"}
                disabled={current.state === "approving"}
                onPress={() => run("deny")}
                style={{ flex: 1 }}
              />
              <Button
                variant="accent"
                icon={failed?.action === "approve" ? "sync" : "check"}
                label={current.state === "approving" ? "Approving…" : failed?.action === "approve" ? "Retry" : "Approve"}
                busy={current.state === "approving"}
                disabled={current.state === "denying"}
                onPress={() => run("approve")}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <View style={styles.resolved}>
            <StatusText {...statusMeta(request)} />
            {request.decision?.by === "You" && resolvedThisSession.has(request.id) && <Button small variant="ghost" label="Undo" onPress={() => undo(request.id)} />}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  topBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[12],
    borderBottomWidth: 1
  },
  back: { flexDirection: "row", alignItems: "center", gap: space[2] },
  content: { padding: space[16], gap: space[20], paddingBottom: space[32] },
  eyebrowLine: { flexDirection: "row", alignItems: "center", gap: space[6] },
  badges: { flexDirection: "row", gap: space[6] },
  reason: { padding: space[16], gap: space[6] },
  fact: { flexDirection: "row", paddingHorizontal: space[16], paddingVertical: space[12], gap: space[12] },
  factLabel: { width: 112, paddingTop: 2 },
  factValue: { flex: 1 },
  step: { flexDirection: "row", gap: space[12], padding: space[16] },
  footer: { borderTopWidth: 1, paddingHorizontal: space[16], paddingTop: space[12], gap: space[10] },
  footerButtons: { flexDirection: "row", gap: space[12] },
  input: { height: 44, borderWidth: 1, paddingHorizontal: space[10], fontFamily: font.sans, fontSize: 15 },
  error: { flexDirection: "row", gap: space[8], padding: space[10], borderWidth: 1 },
  resolved: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }
});
