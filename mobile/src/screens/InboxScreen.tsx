import { ScrollView, StyleSheet, View } from "react-native";

import { useStore } from "../data/store";
import { space } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { Button, Frame, Text } from "../ui/primitives";
import { usePalette } from "../theme/tokens";
import { RequestRow } from "./RequestRow";

type Props = { onOpen: (id: string) => void; onHistory: () => void };

export const InboxScreen = ({ onOpen, onHistory }: Props) => {
  const palette = usePalette();
  const { requests, resolvedThisSession } = useStore();
  const visible = requests
    .filter((request) => request.awaitingYou || resolvedThisSession.has(request.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const waiting = visible.filter((request) => request.status === "pending").length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="titleLg">Needs you</Text>
        <Text variant="body" color="muted">
          {waiting === 0
            ? "Nothing is waiting on your decision."
            : `${waiting} ${waiting === 1 ? "request is" : "requests are"} waiting on your decision.`}
        </Text>
      </View>
      {visible.length === 0 ? (
        <Frame>
          <View style={styles.empty}>
            <Icon name="inbox" size={28} color={palette.muted} />
            <Text variant="titleSm">You're all caught up</Text>
            <Text variant="bodySm" color="muted" style={{ textAlign: "center" }}>
              New access, secret and certificate requests that need you show up here.
            </Text>
          </View>
        </Frame>
      ) : (
        <Frame>
          {visible.map((request, index) => (
            <RequestRow
              key={request.id}
              request={request}
              showActions
              isLast={index === visible.length - 1}
              onOpen={() => onOpen(request.id)}
            />
          ))}
        </Frame>
      )}
      <Button variant="ghost" icon="history" label="View history" onPress={onHistory} style={{ alignSelf: "flex-start" }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: space[16], gap: space[16], paddingBottom: space[40] },
  header: { gap: space[4], paddingTop: space[8] },
  empty: { alignItems: "center", gap: space[8], padding: space[32] }
});
