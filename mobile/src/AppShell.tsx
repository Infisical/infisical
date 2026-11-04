import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ORGANIZATION } from "./data/fixtures";
import { useStore } from "./data/store";
import { HistoryScreen } from "./screens/HistoryScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { RequestDetailScreen } from "./screens/RequestDetailScreen";
import { motion, space, usePalette } from "./theme/tokens";
import { Icon, IconName } from "./ui/Icon";
import { Text } from "./ui/primitives";

type Tab = "inbox" | "history";

const Mark = () => {
  const palette = usePalette();
  return (
    <View style={[styles.mark, { backgroundColor: palette.accent }]}>
      <Text variant="label" style={{ color: palette.onAccent, fontSize: 14 }}>
        I
      </Text>
    </View>
  );
};

export const AppShell = () => {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { requests } = useStore();
  const [tab, setTab] = useState<Tab>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const width = Dimensions.get("window").width;
  const waiting = requests.filter((request) => request.awaitingYou && request.status === "pending").length;

  useEffect(() => {
    if (openId) setShownId(openId);
    Animated.timing(slide, {
      toValue: openId ? 1 : 0,
      duration: openId ? motion.slow : motion.slow - 80,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished && !openId) setShownId(null);
    });
  }, [openId, slide]);

  const tabs: { id: Tab; label: string; icon: IconName; count?: number }[] = [
    { id: "inbox", label: "Needs you", icon: "inbox", count: waiting },
    { id: "history", label: "History", icon: "history" }
  ];

  return (
    <View style={[styles.root, { backgroundColor: palette.inset, paddingTop: insets.top }]}>
      <StatusBar style="auto" />
      <View style={[styles.topBar, { borderBottomColor: palette.line }]}>
        <Mark />
        <Pressable style={styles.org} accessibilityRole="button" accessibilityLabel="Switch organization">
          <Text variant="label">{ORGANIZATION}</Text>
          <Icon name="chev-ud" size={14} color={palette.muted} />
        </Pressable>
        <View style={[styles.demo, { borderColor: palette.line }]}>
          <Text variant="monoSm" color="muted" style={{ fontSize: 11 }}>
            DEMO
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "inbox" ? <InboxScreen onOpen={setOpenId} onHistory={() => setTab("history")} /> : <HistoryScreen onOpen={setOpenId} />}
      </View>

      <View style={[styles.tabBar, { borderTopColor: palette.line, backgroundColor: palette.surface, paddingBottom: insets.bottom }]}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <View style={styles.tabLabel}>
                <Icon name={item.icon} size={20} color={active ? palette.ink : palette.muted} />
                {!!item.count && (
                  <View style={[styles.count, { backgroundColor: palette.accent }]}>
                    <Text variant="monoSm" style={{ color: palette.onAccent, fontSize: 11 }}>
                      {item.count}
                    </Text>
                  </View>
                )}
              </View>
              <Text variant="label" color={active ? "ink" : "muted"} style={{ fontSize: 12 }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {shownId && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.inset,
              paddingTop: insets.top,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }]
            }
          ]}
        >
          <RequestDetailScreen id={shownId} onBack={() => setOpenId(null)} />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { height: 52, flexDirection: "row", alignItems: "center", gap: space[10], paddingHorizontal: space[16], borderBottomWidth: 1 },
  mark: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  org: { flexDirection: "row", alignItems: "center", gap: space[4] },
  demo: { marginLeft: "auto", borderWidth: 1, paddingHorizontal: space[6], height: 20, justifyContent: "center" },
  tabBar: { flexDirection: "row", borderTopWidth: 1 },
  tab: { flex: 1, alignItems: "center", gap: space[4], paddingTop: space[10], paddingBottom: space[6] },
  tabLabel: { flexDirection: "row", alignItems: "center", gap: space[4] },
  count: { minWidth: 18, height: 18, paddingHorizontal: space[4], alignItems: "center", justifyContent: "center" }
});
