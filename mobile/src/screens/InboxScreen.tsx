import { ScrollView, StyleSheet, View } from "react-native";

import { useStore } from "../data/store";
import { space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { List, ListLink, ListSection } from "../ui/List";
import { Text } from "../ui/primitives";
import { RequestRow } from "./RequestRow";

type Props = { onOpen: (id: string) => void; onHistory: () => void };

export const InboxScreen = ({ onOpen, onHistory }: Props) => {
  const palette = usePalette();
  const { requests, resolvedThisSession } = useStore();
  const visible = requests
    .filter((request) => request.awaitingYou || resolvedThisSession.has(request.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const waiting = visible.filter((request) => request.status === "pending");
  const decided = visible.filter((request) => request.status !== "pending");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="titleLg">Needs you</Text>
        <Text variant="body" color="muted">
          {waiting.length === 0
            ? "Nothing is waiting on your decision."
            : `${waiting.length} ${waiting.length === 1 ? "request is" : "requests are"} waiting on your decision.`}
        </Text>
      </View>
      {waiting.length === 0 && (
        <View style={[styles.empty, { backgroundColor: palette.tint }]}>
          <Icon name="inbox" size={28} color={palette.muted} />
          <Text variant="titleSm">You're all caught up</Text>
          <Text variant="bodySm" color="muted" style={{ textAlign: "center" }}>
            New access, secret and certificate requests that need you show up here.
          </Text>
        </View>
      )}
      <List
        variant="segmented"
        label="Requests that need you"
        footer={<ListLink icon="history" label="View history" onPress={onHistory} />}
      >
        {waiting.length > 0 && (
          <ListSection label="Waiting" meta={String(waiting.length)}>
            {waiting.map((request) => (
              <RequestRow key={request.id} request={request} showActions onOpen={() => onOpen(request.id)} />
            ))}
          </ListSection>
        )}
        {decided.length > 0 && (
          <ListSection label="Decided">
            {decided.map((request) => (
              <RequestRow key={request.id} request={request} showActions onOpen={() => onOpen(request.id)} />
            ))}
          </ListSection>
        )}
      </List>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: space[16], gap: space[12], paddingBottom: space[40] },
  header: { gap: space[4], paddingTop: space[8], paddingBottom: space[4] },
  empty: { alignItems: "center", gap: space[8], padding: space[32] }
});
