import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { useStore } from "../data/store";
import { space, usePalette } from "../theme/tokens";
import { Icon } from "../ui/Icon";
import { List, ListLink, ListSection } from "../ui/List";
import { Button, Text } from "../ui/primitives";
import { SkeletonRow } from "../ui/Skeleton";
import { RequestRow } from "./RequestRow";

type Props = { onOpen: (id: string) => void; onHistory: () => void };

export const InboxScreen = ({ onOpen, onHistory }: Props) => {
  const palette = usePalette();
  const { requests, resolvedThisSession, inbox, refreshing, refresh } = useStore();
  const visible = requests
    .filter((request) => request.awaitingYou || resolvedThisSession.has(request.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const waiting = visible.filter((request) => request.status === "pending");
  const loading = inbox.state === "loading";
  const failed = inbox.state === "error" ? inbox.error : null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.muted} colors={[palette.ink]} />}
    >
      <View style={styles.header}>
        <Text variant="titleLg">Needs you</Text>
        <Text variant="body" color="muted">
          {loading
            ? "Checking for requests that need your decision."
            : failed && visible.length === 0
              ? "Your requests didn't load."
              : waiting.length === 0
                ? "Nothing is waiting on your decision."
                : `${waiting.length} ${waiting.length === 1 ? "request is" : "requests are"} waiting on your decision.`}
        </Text>
      </View>
      {failed && (
        <View style={[styles.error, { backgroundColor: palette.badWash, borderColor: palette.badLine }]} accessibilityRole="alert">
          <View style={styles.errorText}>
            <Icon name="alert" size={16} color={palette.bad} />
            <Text variant="bodySm" color="bad" style={{ flex: 1 }}>
              {failed}
            </Text>
          </View>
          <Button small variant="secondary" icon="sync" label={refreshing ? "Retrying…" : "Retry"} busy={refreshing} onPress={refresh} style={{ alignSelf: "flex-start" }} />
        </View>
      )}
      {inbox.state === "ready" && waiting.length === 0 && (
        <View style={[styles.empty, { backgroundColor: palette.tint }]}>
          <Icon name="inbox" size={28} color={palette.muted} />
          <Text variant="titleSm">You're all caught up</Text>
          <Text variant="bodySm" color="muted" style={{ textAlign: "center" }}>
            New requests that need you show up here. Pull down to check again.
          </Text>
        </View>
      )}
      <List variant="segmented" footer={<ListLink icon="history" label="View history" onPress={onHistory} />}>
        {loading ? (
          <ListSection label="Waiting">
            <View accessibilityLabel="Loading requests" style={{ gap: space[4] }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          </ListSection>
        ) : (
          visible.length > 0 && (
            <ListSection label="Waiting" meta={String(waiting.length)}>
              {visible.map((request) => (
                <RequestRow key={request.id} request={request} showActions onOpen={() => onOpen(request.id)} />
              ))}
            </ListSection>
          )
        )}
      </List>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: space[16], gap: space[12], paddingBottom: space[40] },
  header: { gap: space[4], paddingTop: space[8], paddingBottom: space[4] },
  empty: { alignItems: "center", gap: space[8], padding: space[32] },
  error: { gap: space[10], padding: space[12], borderWidth: 1 },
  errorText: { flexDirection: "row", gap: space[8] }
});
