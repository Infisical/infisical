import { ScrollView, StyleSheet, View } from "react-native";

import { useStore } from "../data/store";
import { ApprovalRequest } from "../data/types";
import { space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { List, ListSection } from "../ui/List";
import { Text } from "../ui/primitives";
import { RequestRow } from "./RequestRow";

const closedAt = (request: ApprovalRequest) => request.decision?.at ?? request.expiresAt ?? request.createdAt;

export const HistoryScreen = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const palette = usePalette();
  const { requests, historyComplete } = useStore();
  const decided = requests
    .filter((request) => request.status !== "pending")
    .sort((a, b) => closedAt(b) - closedAt(a));
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    { label: "Today", items: decided.filter((r) => closedAt(r) >= startOfToday) },
    { label: "Earlier", items: decided.filter((r) => closedAt(r) < startOfToday) }
  ].filter((group) => group.items.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="titleLg">History</Text>
        <Text variant="body" color="muted">
          {historyComplete ? "Decisions on requests you could approve." : "Decisions you made since you opened the app."}
        </Text>
      </View>
      {!historyComplete && decided.length === 0 && (
        <View style={[styles.empty, { backgroundColor: palette.tint }]}>
          <Icon name="history" size={28} color={palette.muted} />
          <Text variant="titleSm">Full history is coming</Text>
          <Text variant="bodySm" color="muted" style={{ textAlign: "center" }}>
            Past decisions aren't in the app yet. Requests you approve or deny now show up here until you close the app.
          </Text>
        </View>
      )}
      <List variant="divided">
        {groups.map((group) => (
          <ListSection key={group.label} label={group.label} meta={String(group.items.length)}>
            {group.items.map((request) => (
              <RequestRow key={request.id} request={request} showActions={false} onOpen={() => onOpen(request.id)} />
            ))}
          </ListSection>
        ))}
      </List>
      {!historyComplete && decided.length > 0 && (
        <Text variant="bodySm" color="muted" style={{ paddingHorizontal: space[12] }}>
          Full history is coming. Until then, this list clears when you close the app.
        </Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: space[16], gap: space[12], paddingBottom: space[40] },
  header: { gap: space[4], paddingTop: space[8], paddingBottom: space[4] },
  empty: { alignItems: "center", gap: space[8], padding: space[32] }
});
