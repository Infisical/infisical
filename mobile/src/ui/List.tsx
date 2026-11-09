import { createContext, ReactNode, useContext, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { space, usePalette } from "../theme/tokens";
import { Icon, IconName } from "./Icon";
import { Text } from "./primitives";

type Variant = "segmented" | "divided";

const VariantContext = createContext<Variant>("segmented");

type ListProps = {
  variant: Variant;
  title?: string;
  count?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export const List = ({ variant, title, count, action, footer, children }: ListProps) => (
  <VariantContext value={variant}>
    <View>
      {(title || count || action) && (
        <View style={styles.header}>
          {title && (
            <Text variant="titleSm" style={{ flex: 1 }}>
              {title}
            </Text>
          )}
          {count && (
            <Text variant="bodySm" color="muted">
              {count}
            </Text>
          )}
          {action}
        </View>
      )}
      <View style={variant === "segmented" ? styles.segmented : undefined}>{children}</View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  </VariantContext>
);

export const ListSection = ({ label, meta, children }: { label: string; meta?: string; children: ReactNode }) => {
  const variant = useContext(VariantContext);
  return (
    <View>
      <View style={styles.sectionHead}>
        <Text variant="eyebrow" color="muted" numberOfLines={1}>
          {label}
        </Text>
        {meta && (
          <Text variant="monoSm" color="muted">
            {meta}
          </Text>
        )}
      </View>
      <View style={variant === "segmented" ? styles.segmented : undefined}>{children}</View>
    </View>
  );
};

export const Media = ({ icon, tone, unread, surface }: { icon: IconName; tone?: "bad"; unread?: boolean; surface: string }) => {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.media,
        tone === "bad"
          ? { backgroundColor: palette.badWash, borderColor: palette.badLine }
          : { backgroundColor: palette.surface, borderColor: palette.line }
      ]}
    >
      <Icon name={icon} size={18} color={tone === "bad" ? palette.bad : palette.ink} />
      {unread && <View style={[styles.unread, { backgroundColor: palette.accentFg, borderColor: surface }]} />}
    </View>
  );
};

type RowProps = {
  title: ReactNode;
  meta?: string;
  description?: string;
  media?: (surface: string) => ReactNode;
  resolved?: boolean;
  onPress?: () => void;
  children?: ReactNode;
};

export const ListRow = ({ title, meta, description, media, resolved, onPress, children }: RowProps) => {
  const palette = usePalette();
  const variant = useContext(VariantContext);
  const [pressed, setPressed] = useState(false);
  const surface =
    variant === "segmented" ? (resolved ? palette.rowDoneCard : palette.tint) : resolved ? palette.rowDoneDivided : palette.inset;
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: variant === "segmented" || resolved ? surface : "transparent" },
        variant === "divided" && { borderBottomWidth: 1, borderBottomColor: palette.lineSoft }
      ]}
    >
      {pressed && <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.hover }]} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        disabled={!onPress}
        accessibilityRole={onPress ? "link" : undefined}
        style={styles.target}
      >
        {media?.(variant === "segmented" ? surface : palette.inset)}
        <View style={styles.body}>
          <View style={styles.titleLine}>
            <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
            {meta && (
              <Text variant="monoSm" color="muted" style={{ lineHeight: 20 }}>
                {meta}
              </Text>
            )}
          </View>
          {description && (
            <Text variant="bodySm" color="muted">
              {description}
            </Text>
          )}
        </View>
      </Pressable>
      {children && <View style={[styles.extra, media && styles.extraIndent]}>{children}</View>}
    </View>
  );
};

export const ListLink = ({ label, icon, onPress }: { label: string; icon?: IconName; onPress: () => void }) => {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.link}>
      {({ pressed }) => (
        <>
          {icon && <Icon name={icon} size={14} color={palette.ink} />}
          <Text
            variant="label"
            style={{ textDecorationLine: "underline", textDecorationColor: palette.ink, opacity: pressed ? 0.7 : 1 }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};

export type DataListItem = { term: string; value: ReactNode; half?: boolean; mono?: boolean };

export const DataList = ({ items }: { items: DataListItem[] }) => {
  const palette = usePalette();
  const rows: DataListItem[][] = [];
  items.forEach((item, index) => {
    const previous = rows[rows.length - 1];
    if (item.half && previous?.length === 1 && previous[0].half && items[index - 1] === previous[0]) previous.push(item);
    else rows.push([item]);
  });
  const value = (item: DataListItem) =>
    typeof item.value === "string" ? (
      <Text variant={item.mono ? "monoSm" : "bodySm"} style={item.mono ? { lineHeight: 18 } : undefined}>
        {item.value}
      </Text>
    ) : (
      item.value
    );
  return (
    <View>
      {rows.map((row, index) => (
        <View key={index} style={[styles.dataRow, index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.lineSoft }]}>
          {row.length === 2 ? (
            row.map((item) => (
              <View key={item.term} style={styles.dataHalf}>
                <Text variant="bodySm" color="muted">
                  {item.term}
                </Text>
                {value(item)}
              </View>
            ))
          ) : (
            <>
              <Text variant="bodySm" color="muted" style={styles.dataTerm}>
                {row[0].term}
              </Text>
              <View style={{ flex: 1 }}>{value(row[0])}</View>
            </>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[12] },
  segmented: { gap: space[4] },
  sectionHead: {
    height: 32,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: space[12],
    paddingBottom: space[6]
  },
  footer: { paddingHorizontal: space[12], paddingTop: space[8] },
  row: { padding: space[12], gap: space[4], overflow: "hidden" },
  target: { flexDirection: "row", alignItems: "flex-start", gap: space[12] },
  body: { flex: 1, minWidth: 0, gap: space[4] },
  extra: { gap: space[4] },
  extraIndent: { marginLeft: 36 + space[12] },
  titleLine: { flexDirection: "row", alignItems: "flex-start", gap: space[8] },
  media: { width: 36, height: 36, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  unread: { position: "absolute", top: -4, right: -4, width: 10, height: 10, borderWidth: 2 },
  link: { flexDirection: "row", alignItems: "center", gap: space[6], alignSelf: "flex-start", paddingVertical: space[4] },
  dataRow: { flexDirection: "row", minHeight: 32, paddingHorizontal: space[12], paddingVertical: space[6], gap: space[12] },
  dataTerm: { width: 112 },
  dataHalf: { flex: 1, gap: space[2] }
});
