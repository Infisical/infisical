import { useState } from "react";
import { format } from "date-fns";
import { HourglassIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v4/ui/hover-card";
import { Icon } from "@app/components/v4/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Spinner } from "@app/components/v4/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { ProviderLogo } from "../flows/wizard-sheet";
import { NEXT_PHASE } from "../overview-cells";
import type { LocalSecretSync } from "./sync-model";

import styles from "./secret-sync.module.css";

type SyncStatus = NonNullable<LocalSecretSync["status"]>;

const failureMessageOf = (sync: LocalSecretSync) => {
  if (sync.status !== "failed") return null;
  if (!sync.lastSyncMessage) return "An unknown error occurred.";
  try {
    return JSON.stringify(JSON.parse(sync.lastSyncMessage), null, 2);
  } catch {
    return sync.lastSyncMessage;
  }
};

function StatusMark({ status }: { status: SyncStatus }) {
  if (status === "running") return <Spinner />;
  if (status === "pending") return <Icon icon={HourglassIcon} />;
  return <Icon name={status === "failed" ? "alert" : "check"} />;
}

const STATUS_BADGE: Record<SyncStatus, { tone: "ok" | "bad" | "info"; label: string }> = {
  failed: { tone: "bad", label: "Failed to sync" },
  succeeded: { tone: "ok", label: "Synced" },
  pending: { tone: "info", label: "Queued" },
  running: { tone: "info", label: "Syncing" }
};

export function SecretSyncRowStatusBadge({ sync }: { sync: LocalSecretSync }) {
  if (!sync.status) return null;
  const { tone, label } = STATUS_BADGE[sync.status];
  const badge = (
    <Badge tone={tone}>
      <StatusMark status={sync.status} />
      {label}
    </Badge>
  );
  const failureMessage = failureMessageOf(sync);
  if (
    !(sync.status === "succeeded" || sync.status === "failed") ||
    (!sync.lastSyncedAt && !failureMessage)
  )
    return badge;
  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className={styles.hoverTrigger}>
          {badge}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" className={styles.statusCard}>
        {sync.lastSyncedAt && (
          <div className={styles.statusBlock}>
            <span
              className={styles.statusLabel}
              data-tone={sync.status === "failed" ? "warn" : "ok"}
            >
              <Icon name="calendar" size="var(--v4-size-icon-xs)" />
              Last synced
            </span>
            <span className={styles.statusValue}>
              {format(new Date(sync.lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
            </span>
          </div>
        )}
        {failureMessage && (
          <div className={styles.statusBlock}>
            <span className={styles.statusLabel} data-tone="bad">
              <Icon name="x" size="var(--v4-size-icon-xs)" />
              Failure reason
            </span>
            <span className={styles.statusValue} data-message>
              {failureMessage}
            </span>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function SecretSyncStatusBadge({
  syncs,
  project,
  environments
}: {
  syncs: readonly LocalSecretSync[];
  project: string;
  environments: string[];
  // eslint-disable-next-line react/no-unused-prop-types -- main filters the badge by environment only, the host still passes the path
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = syncs.filter(
    (sync) =>
      sync.project === project && (!environments.length || environments.includes(sync.environment))
  );
  const running = filtered.filter((sync) => sync.status === "running" || sync.status === "pending");
  const failed = filtered.filter((sync) => sync.status === "failed");
  const succeeded = filtered.filter((sync) => sync.status === "succeeded");

  let state:
    | { tone: "info" | "bad" | "ok"; label: string; mark: SyncStatus; title: string }
    | undefined;
  if (running.length)
    state = {
      tone: "info",
      label: running.length === 1 ? "Syncing" : `Syncing (${running.length})`,
      mark: "running",
      title: "Currently syncing"
    };
  else if (failed.length)
    state = {
      tone: "bad",
      label: failed.length === 1 ? "Sync failed" : `Sync failed (${failed.length})`,
      mark: "failed",
      title: "Failed syncs"
    };
  else if (succeeded.length)
    state = { tone: "ok", label: "Synced", mark: "succeeded", title: "All syncs succeeded" };
  if (!state) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge asChild tone={state.tone}>
          <button type="button" className={styles.badgeButton}>
            <StatusMark status={state.mark} />
            {state.label}
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="end" className={styles.statusPopover}>
        <p className={styles.popoverTitle}>{state.title}</p>
        <div className={styles.statusScroll} data-scroll-fade="y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={styles.logoCell} />
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sync) => {
                const meta = SECRET_SYNC_MAP[sync.destination as SecretSync];
                return (
                  <TableRow key={sync.id}>
                    <TableCell className={styles.logoCell}>
                      <ProviderLogo image={meta?.image} size={20} />
                    </TableCell>
                    <TableCell className={styles.nameCell}>
                      <Tooltip content={`Sync details are ${NEXT_PHASE.toLowerCase()}`}>
                        <span className={styles.truncate}>{sync.name}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <SecretSyncRowStatusBadge sync={sync} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PopoverContent>
    </Popover>
  );
}
