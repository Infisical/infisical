import { ScrollView, StyleSheet, View } from "react-native";

import { useStore } from "../data/store";
import { space } from "../theme/tokens";
import { Eyebrow, Frame, Text } from "../ui/primitives";
import { RequestRow } from "./RequestRow";

const DAY = 24 * 60 * 60 * 1000;

export const HistoryScreen = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { requests } = useStore();
  const decided = requests
    .filter((request) => request.status !== "pending")
    .sort((a, b) => (b.decision?.at ?? b.expiresAt) - (a.decision?.at ?? a.expiresAt));
  const now = Date.now();
  const groups = [
    { label: "Today", items: decided.filter((r) => now - (r.decision?.at ?? r.expiresAt) < DAY) },
    { label: "Earlier", items: decided.filter((r) => now - (r.decision?.at ?? r.expiresAt) >= DAY) }
  ].filter((group) => group.items.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="titleLg">History</Text>
        <Text variant="body" color="muted">
          Decisions on requests you could approve.
        </Text>
      </View>
      {groups.map((group) => (
        <View key={group.label} style={{ gap: space[8] }}>
          <Eyebrow>{group.label}</Eyebrow>
          <Frame>
            {group.items.map((request, index) => (
              <RequestRow
                key={request.id}
                request={request}
                showActions={false}
                isLast={index === group.items.length - 1}
                onOpen={() => onOpen(request.id)}
              />
            ))}
          </Frame>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: space[16], gap: space[20], paddingBottom: space[40] },
  header: { gap: space[4], paddingTop: space[8] }
});
