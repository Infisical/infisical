import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { space, usePalette } from "../theme/tokens";

const Block = ({ width, height }: { width: number | `${number}%`; height: number }) => {
  const palette = usePalette();
  return <View style={{ width, height, backgroundColor: palette.line }} />;
};

export const SkeletonRow = () => {
  const palette = usePalette();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.row, { backgroundColor: palette.tint, opacity: pulse }]}>
      <View style={styles.top}>
        <View style={[styles.media, { borderColor: palette.line }]} />
        <View style={styles.lines}>
          <View style={styles.titleLine}>
            <Block width="55%" height={14} />
            <Block width={24} height={12} />
          </View>
          <Block width="85%" height={12} />
        </View>
      </View>
      <View style={styles.actions}>
        <Block width={64} height={32} />
        <Block width={96} height={32} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: { padding: space[12], gap: space[8] },
  top: { flexDirection: "row", gap: space[12] },
  media: { width: 36, height: 36, borderWidth: 1 },
  lines: { flex: 1, gap: space[8], paddingTop: space[3] },
  titleLine: { flexDirection: "row", justifyContent: "space-between" },
  actions: { flexDirection: "row", gap: space[8], marginLeft: 36 + space[12], marginTop: space[4] }
});
