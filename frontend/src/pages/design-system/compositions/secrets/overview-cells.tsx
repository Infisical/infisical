import type { ReactNode } from "react";
import {
  BanIcon,
  ChevronsLeftRightEllipsisIcon,
  CircleIcon,
  FingerprintIcon,
  GitBranchIcon,
  HexagonIcon,
  ImportIcon,
  type LucideIcon,
  SaveIcon,
  Undo2Icon
} from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { TableCell } from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { Resource, ResourceKind } from "../secrets-model";
import type { PendingType } from "./batch/pending";
import type { RowAction } from "./row-actions/types";

import styles from "./overview.module.css";

export const NEXT_PHASE = "Ported in the next phase";
export type EnvironmentOption = { value: string; label: string };
export type RowContext = {
  environments: EnvironmentOption[];
  single: boolean;
  path: string;
  writeBlock?: string;
  selected: string[];
  recent: string[];
  onToggleSelect: (key: string) => void;
  report: (message: string) => void;
  onAction: (action: RowAction) => void;
  pending?: Record<string, PendingType>;
  selectionDisabled?: boolean;
  onSavePending?: (id: string) => void;
  onRevertPending?: (id: string) => void;
};
export type EnvironmentStatus = "present" | "missing" | "empty" | "imported" | "no-access";
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
export function KindIcon({ kind, overlay }: { kind: ResourceKind; overlay?: KindOverlay }) {
  if (!overlay) return <Icon {...kindGlyphs[kind]} />;
  return (
    <span className={styles.overlayIcon}>
      <Icon {...kindGlyphs[kind]} />
      <span className={styles.overlayMark} data-overlay={overlay}>
        <Icon {...kindGlyphs[overlay]} size={10} />
      </span>
    </span>
  );
}

const statusMeta: Record<EnvironmentStatus, Glyph & { label: string }> = {
  present: { label: "Present in environment", name: "check" },
  missing: { label: "Missing from environment", name: "minus" },
  empty: { label: "Empty value in environment", icon: CircleIcon },
  imported: { label: "Imported into environment", icon: ImportIcon },
  "no-access": { label: "You do not have permission to view this resource", icon: BanIcon }
};
export function StatusCell({
  status,
  hasOverride
}: {
  status: EnvironmentStatus;
  hasOverride?: boolean;
}) {
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
}
export const presenceOf = (entries: Resource[], environment: string): EnvironmentStatus =>
  entries.some((entry) => entry.environment === environment) ? "present" : "missing";

export function ActionButton({
  label,
  name,
  icon,
  disabledReason,
  onClick
}: Glyph & {
  label: string;
  disabledReason?: string;
  onClick?: () => void;
}) {
  return (
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
}

const pendingBadges = {
  create: { tone: "ok", label: "New" },
  update: { tone: "ok", label: "Modified" },
  delete: { tone: "bad", label: "Deleted" }
} as const;

export function PendingBadge({ type }: { type?: PendingType }) {
  if (!type) return null;
  const { tone, label } = pendingBadges[type];
  return (
    <Badge size="sm" tone={tone}>
      {label}
    </Badge>
  );
}

export function PendingActions({ id, ctx }: { id: string; ctx: RowContext }) {
  if (!ctx.pending?.[id]) return null;
  return (
    <>
      <ActionButton
        label="Save pending changes"
        icon={SaveIcon}
        disabledReason={ctx.writeBlock}
        onClick={() => ctx.onSavePending?.(id)}
      />
      <ActionButton
        label="Discard pending changes"
        icon={Undo2Icon}
        onClick={() => ctx.onRevertPending?.(id)}
      />
    </>
  );
}

export function SelectCell({
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
}) {
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
              disabled={ctx.selectionDisabled}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => ctx.onToggleSelect(rowKey)}
            />
          </span>
        )}
      </span>
    </TableCell>
  );
}

export function ExpandToggle({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
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
}
