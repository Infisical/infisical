import { Pressable, StyleSheet, View } from "react-native";

import { ago, pastTense, summary, typeIcon } from "../data/format";
import { useStore } from "../data/store";
import { ApprovalRequest } from "../data/types";
import { space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { Badge, Button, StatusText, Text } from "../ui/primitives";
import { confirmWithDevice, decisionHaptic } from "./decide";

export const statusMeta = (request: ApprovalRequest) => {
  const label = pastTense(request);
  if (request.status === "approved") return { icon: "check-c" as const, label, tone: "ok" as const };
  if (request.status === "rejected") return { icon: "x" as const, label, tone: "bad" as const };
  if (request.status === "pending") return { icon: "clock" as const, label, tone: "warn" as const };
  return { icon: "clock" as const, label, tone: "neutral" as const };
};

type Props = { request: ApprovalRequest; onOpen: () => void; showActions: boolean; isLast: boolean };

export const RequestRow = ({ request, onOpen, showActions, isLast }: Props) => {
  const palette = usePalette();
  const { activity, decide, undo } = useStore();
  const current = activity[request.id] ?? { state: "idle" };
  const failed = current.state === "failed" ? current : null;
  const resolved = request.status !== "pending";
  const unread = !resolved && Date.now() - request.createdAt < 10 * 60 * 1000;

  const run = async (action: "approve" | "deny") => {
    if (action === "approve" && !(await confirmWithDevice(`Approve ${request.resource}`))) return;
    await decide(request.id, action);
    decisionHaptic(action);
  };

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: resolved && showActions ? palette.rowDone : pressed ? palette.hover : "transparent" },
        !isLast && { borderBottomWidth: 1, borderBottomColor: palette.lineSoft }
      ]}
    >
      <View style={[styles.tile, { backgroundColor: failed ? palette.badBg : palette.tint }]}>
        <Icon name={failed ? "alert" : typeIcon[request.type]} size={18} color={failed ? palette.bad : palette.ink} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          {unread && <View style={[styles.dot, { backgroundColor: palette.accentFg }]} />}
          <Text variant="mono" numberOfLines={1} style={{ flexShrink: 1 }} color={resolved && showActions ? "muted" : "ink"}>
            {request.resource}
          </Text>
          <Text variant="monoSm" color="muted" style={styles.age}>
            {ago(request.createdAt)}
          </Text>
        </View>
        <Text variant="bodySm" color="text2" numberOfLines={1}>
          {request.requesterName} · {summary(request)} · {request.projectName}
        </Text>
        {request.isProduction && !resolved && <Badge label="production" tone="warn" />}
        {failed && (
          <View accessibilityRole="alert">
            <Text variant="bodySm" color="bad">
              {failed.error}
            </Text>
          </View>
        )}
        {showActions && !resolved && (
          <View style={styles.actions}>
            <Button
              small
              variant="secondary"
              label={current.state === "denying" ? "Denying…" : "Deny"}
              busy={current.state === "denying"}
              disabled={current.state === "approving"}
              onPress={() => run("deny")}
            />
            <Button
              small
              variant="accent"
              icon={failed ? "sync" : "check"}
              label={current.state === "approving" ? "Approving…" : failed ? "Retry" : "Approve"}
              busy={current.state === "approving"}
              disabled={current.state === "denying"}
              onPress={() => run(failed?.action ?? "approve")}
            />
          </View>
        )}
        {(resolved || !showActions) && (
          <View style={styles.actions}>
            <StatusText {...statusMeta(request)} />
            {showActions && request.decision?.by === "You" && (
              <Button small variant="ghost" label="Undo" onPress={() => undo(request.id)} />
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[12], padding: space[16] },
  tile: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: space[6] },
  titleLine: { flexDirection: "row", alignItems: "center", gap: space[6] },
  dot: { width: 6, height: 6 },
  age: { marginLeft: "auto" },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], marginTop: space[4], minHeight: 32 }
});
