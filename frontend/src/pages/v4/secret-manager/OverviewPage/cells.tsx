import type { ReactNode } from "react";
import {
  BanIcon,
  ChevronsLeftRightEllipsisIcon,
  CircleIcon,
  FingerprintIcon,
  GitBranchIcon,
  HexagonIcon,
  ImportIcon,
  type LucideIcon
} from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { TableCell } from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { ResourceKind } from "./model";

import styles from "./overview.module.css";

export const NOT_PORTED = "Not available in v4 yet";
export const ROW_ACTION_SLOTS = 4;
export type EnvironmentOption = { value: string; label: string };
export type RowContext = {
  projectId: string;
  environments: EnvironmentOption[];
  single: boolean;
  path: string;
  writeBlock?: string;
  selected: string[];
  onToggleSelect: (key: string) => void;
  report: (message: string) => void;
};
export type EnvironmentStatus = "present" | "missing" | "empty" | "no-access";
type Glyph = { name?: IconName; icon?: LucideIcon };

const kindGlyphs: Record<ResourceKind, Glyph> = {
  folder: { name: "folder" },
  secret: { name: "key" },
  import: { icon: ImportIcon },
  dynamic: { icon: FingerprintIcon },
  rotation: { name: "sync" },
  honey: { icon: HexagonIcon },
  proxy: { icon: ChevronsLeftRightEllipsisIcon }
};
export type KindOverlay = "rotation" | "honey";
export const KindIcon = ({ kind, overlay }: { kind: ResourceKind; overlay?: KindOverlay }) => {
  if (!overlay) return <Icon {...kindGlyphs[kind]} />;
  return (
    <span className={styles.overlayIcon}>
      <Icon {...kindGlyphs[kind]} />
      <span className={styles.overlayMark} data-overlay={overlay}>
        <Icon {...kindGlyphs[overlay]} size={10} />
      </span>
    </span>
  );
};

const statusMeta: Record<EnvironmentStatus, Glyph & { label: string }> = {
  present: { label: "Present in environment", name: "check" },
  missing: { label: "Missing from environment", name: "minus" },
  empty: { label: "Empty value in environment", icon: CircleIcon },
  "no-access": { label: "You do not have permission to view this value", icon: BanIcon }
};
export const StatusCell = ({
  status,
  hasOverride
}: {
  status: EnvironmentStatus;
  hasOverride?: boolean;
}) => {
  const meta = statusMeta[status];
  return (
    <TableCell className={styles.statusCell} data-status={status}>
      <span className={styles.statusGroup}>
        <Tooltip content={meta.label}>
          <span className={styles.statusMark}>
            <Icon name={meta.name} icon={meta.icon} label={meta.label} />
          </span>
        </Tooltip>
        {hasOverride && (
          <Tooltip content="Has personal override">
            <span className={styles.overrideMark}>
              <Icon icon={GitBranchIcon} label="Has personal override" />
            </span>
          </Tooltip>
        )}
      </span>
    </TableCell>
  );
};

export const ActionButton = ({
  label,
  name,
  icon,
  disabledReason,
  onClick
}: Glyph & {
  label: string;
  disabledReason?: string;
  onClick?: () => void;
}) => (
  <Tooltip content={disabledReason ?? label}>
    <span className={styles.actionSlot}>
      <Button
        variant="ghost"
        size="icon-row"
        iconOnly
        disabled={Boolean(disabledReason)}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        <Icon name={name} icon={icon} />
        <span className="sr-only">{label}</span>
      </Button>
    </span>
  </Tooltip>
);

export const SelectCell = ({
  kind,
  rowKey,
  label,
  ctx,
  selectable,
  alternate,
  overlay,
  pinned
}: {
  kind: ResourceKind;
  rowKey: string;
  label: string;
  ctx: RowContext;
  selectable: boolean;
  alternate?: ReactNode;
  overlay?: KindOverlay;
  pinned?: boolean;
}) => {
  const isSelected = ctx.selected.includes(rowKey);
  return (
    <TableCell className={styles.iconCell}>
      <span className={styles.iconSlot} data-selected={isSelected || pinned || undefined}>
        <span className={styles.kindGlyph}>
          <KindIcon kind={kind} overlay={overlay} />
        </span>
        {alternate && <span className={styles.rowCheck}>{alternate}</span>}
        {selectable && !alternate && (
          <span className={styles.rowCheck}>
            <Checkbox
              aria-label={`Select ${label}`}
              checked={isSelected}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => ctx.onToggleSelect(rowKey)}
            />
          </span>
        )}
      </span>
    </TableCell>
  );
};

export const ExpandToggle = ({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) => (
  <Button
    variant="ghost"
    size="icon-row"
    iconOnly
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
  >
    <Icon name={expanded ? "chev-down" : "chev-right"} />
    <span className="sr-only">{`${expanded ? "Collapse" : "Expand"} ${label}`}</span>
  </Button>
);

export const InfoHint = ({ text }: { text: string }) => (
  <Tooltip content={text}>
    <span className={styles.hint}>
      <Icon name="info" size={12} label={text} />
    </span>
  </Tooltip>
);

export const copyText = async (
  value: string,
  done: string,
  failed: string,
  report: (message: string) => void
) => {
  try {
    await navigator.clipboard.writeText(value);
    report(done);
  } catch {
    report(failed);
  }
};
