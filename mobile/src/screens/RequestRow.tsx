import { StyleSheet, View } from "react-native";

import { ago, pastTense, summary, typeIcon } from "../data/format";
import { useStore } from "../data/store";
import { ApprovalRequest } from "../data/types";
import { space } from "../theme/tokens";
import { ListRow, Media } from "../ui/List";
import { Badge, Button, StatusText, Text } from "../ui/primitives";
import { confirmWithDevice, decisionHaptic } from "./decide";

export const statusMeta = (request: ApprovalRequest) => {
  const label = pastTense(request);
  if (request.status === "approved") return { icon: "check-c" as const, label, tone: "ok" as const };
  if (request.status === "rejected") return { icon: "x" as const, label, tone: "bad" as const };
  if (request.status === "pending") return { icon: "clock" as const, label, tone: "warn" as const };
  return { icon: "clock" as const, label, tone: "neutral" as const };
};

type Props = { request: ApprovalRequest; onOpen: () => void; showActions: boolean };

export const RequestRow = ({ request, onOpen, showActions }: Props) => {
  const { activity, decide, undo } = useStore();
  const current = activity[request.id] ?? { state: "idle" };
  const failed = current.state === "failed" && request.status === "pending" ? current : null;
  const resolved = request.status !== "pending";
  const unread = !resolved && Date.now() - request.createdAt < 10 * 60 * 1000;

  const run = async (action: "approve" | "deny") => {
    if (action === "approve" && !(await confirmWithDevice(`Approve ${request.resource}`))) return;
    if (await decide(request.id, action)) decisionHaptic(action);
  };

  return (
    <ListRow
      onPress={onOpen}
      resolved={resolved && showActions}
      meta={ago(request.createdAt)}
      media={(surface) => (
        <Media icon={failed ? "alert" : typeIcon[request.type]} tone={failed ? "bad" : undefined} unread={unread} surface={surface} />
      )}
      title={
        <Text variant="mono" numberOfLines={1} color={resolved && showActions ? "muted" : "ink"} style={styles.title}>
          {request.resource}
        </Text>
      }
      description={`${request.requesterName} · ${summary(request)} · ${request.projectName}`}
    >
      {request.isProduction && !resolved && <Badge label="production" tone="warn" />}
      {failed && (
        <View accessibilityRole="alert">
          <Text variant="bodySm" color="bad">
            {failed.error}
          </Text>
        </View>
      )}
      {showActions && !resolved ? (
        <View style={styles.actions}>
          <Button
            small
            variant="secondary"
            label={current.state === "denying" ? "Denying…" : failed?.action === "deny" ? "Retry" : "Deny"}
            busy={current.state === "denying"}
            disabled={current.state === "approving"}
            onPress={() => run("deny")}
          />
          <Button
            small
            variant="accent"
            icon={failed?.action === "approve" ? "sync" : "check"}
            label={current.state === "approving" ? "Approving…" : failed?.action === "approve" ? "Retry" : "Approve"}
            busy={current.state === "approving"}
            disabled={current.state === "denying"}
            onPress={() => run("approve")}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <StatusText {...statusMeta(request)} />
          {showActions && request.decision?.by === "You" && <Button small variant="ghost" label="Undo" onPress={() => undo(request.id)} />}
        </View>
      )}
    </ListRow>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], marginTop: space[4], minHeight: 32 }
});
