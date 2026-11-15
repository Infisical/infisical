import { type ReactNode, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Inline } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Meta } from "@infisical/cipher/ui/text";

import {
  BOOLEAN_SYNC_OPTION_FIELDS,
  getPkiSyncFailureMessage,
  getSyncOptionDisplayValue,
  getUnusedExportOptionKeys,
  VALUE_SYNC_OPTION_FIELDS
} from "@app/helpers/pkiSyncs";
import { type PkiSyncExportFormat, PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { Dash } from "../../access/org/detail-parts";
import { formatDateTime } from "../../access/roles";
import { FIELD_MAPPING_DESTINATIONS } from "../components/pki-syncs/options/field-mappings-fields";
import { usePkiSyncOption } from "../components/pki-syncs/shared";

const DESTINATION_OWNED_OPTIONS = new Set<string>(["exportFormat"]);

const LABEL_VALUE_OPTIONS = new Set<string>(["bundleMethod"]);

const sentenceCase = (label: string) =>
  label
    .split(" ")
    .map((word, index) =>
      index === 0 || (word.length > 1 && word === word.toUpperCase()) ? word : word.toLowerCase()
    )
    .join(" ");

const wrapAnywhere = { overflowWrap: "anywhere" } as const;

export const pkiSyncOptionItems = (pkiSync: TPkiSync): DataListItem[] => {
  const syncOptions = pkiSync.syncOptions as Record<string, unknown> | undefined;
  const unusedOptionKeys = getUnusedExportOptionKeys(
    syncOptions?.exportFormat as PkiSyncExportFormat | undefined
  );

  const booleanItems = BOOLEAN_SYNC_OPTION_FIELDS.flatMap(({ key, label }): DataListItem[] => {
    const value = syncOptions?.[key];
    if (typeof value !== "boolean" || unusedOptionKeys.has(key)) return [];
    return [
      [
        sentenceCase(label),
        <Badge key={key} tone={value ? "ok" : "outline"}>
          {value ? "Enabled" : "Disabled"}
        </Badge>
      ]
    ];
  });

  const valueItems = VALUE_SYNC_OPTION_FIELDS.flatMap(({ key, label }): DataListItem[] => {
    if (DESTINATION_OWNED_OPTIONS.has(key) || unusedOptionKeys.has(key)) return [];
    const displayValue = getSyncOptionDisplayValue(pkiSync.destination, key, syncOptions?.[key]);
    if (displayValue === null) return [];
    return [
      [
        sentenceCase(label),
        LABEL_VALUE_OPTIONS.has(key) ? (
          displayValue
        ) : (
          <Code key={key} style={wrapAnywhere}>
            {displayValue}
          </Code>
        )
      ]
    ];
  });

  return [...booleanItems, ...valueItems];
};

const FIELD_MAPPING_ROWS = [
  { key: "certificate", label: "Certificate field", fallback: "certificate" },
  { key: "privateKey", label: "Private key field", fallback: "private_key" },
  { key: "certificateChain", label: "Certificate chain field", fallback: "certificate_chain" },
  { key: "caCertificate", label: "CA certificate field", fallback: "ca_certificate" }
] as const;

export const pkiSyncFieldMappingItems = (pkiSync: TPkiSync): DataListItem[] => {
  if (!FIELD_MAPPING_DESTINATIONS.includes(pkiSync.destination)) return [];
  const fieldMappings = pkiSync.syncOptions?.fieldMappings;
  return FIELD_MAPPING_ROWS.map(({ key, label, fallback }) => [
    label,
    <Code key={key} style={wrapAnywhere}>
      {fieldMappings?.[key] || fallback}
    </Code>
  ]);
};

export function SyncErrorMessage({ message }: { message: string }) {
  return (
    <Code block wrap format="plain" maxHeight={240}>
      {message}
    </Code>
  );
}

function HostCommandValue({
  label,
  command,
  showCommandLabel,
  dialogDescription
}: {
  label: string;
  command?: string | null;
  showCommandLabel: string;
  dialogDescription: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (!command) return <Dash />;
  return (
    <>
      <Button
        type="button"
        variant="link"
        size="sm"
        underline="hover"
        onClick={() => setIsOpen(true)}
      >
        {showCommandLabel}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <CodeBlock code={command} wrap maxHeight={384} copyable copyLabel="Copy command" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PkiSyncCommandsCard({
  pkiSync,
  action
}: {
  pkiSync: TPkiSync;
  action?: ReactNode;
}) {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const canRunHealthCheck = Boolean(syncOption?.canRunHealthCheckCommand);
  const canRunPostSync = Boolean(syncOption?.canRunPostSyncCommand);
  if (!canRunHealthCheck && !canRunPostSync) return null;

  const { healthCheckCommand, postSyncCommand } = pkiSync.syncOptions;
  const { lastHealthCheckRanAt, lastHealthCheckStatus, lastHealthCheckMessage } = pkiSync;
  const syncFailureMessage = getPkiSyncFailureMessage(pkiSync.syncStatus, pkiSync.lastSyncMessage);
  const checkErrorMessage =
    lastHealthCheckStatus === PkiSyncStatus.Failed &&
    lastHealthCheckMessage &&
    lastHealthCheckMessage !== syncFailureMessage
      ? lastHealthCheckMessage
      : null;
  const checkFailed = lastHealthCheckStatus === PkiSyncStatus.Failed;

  const items: DataListItem[] = [];
  if (canRunHealthCheck) {
    items.push([
      "Health check",
      <HostCommandValue
        key="health-check"
        label="Health check"
        command={healthCheckCommand}
        showCommandLabel="Show check"
        dialogDescription="Runs on the destination host before this sync delivers anything. A non-zero exit stops the sync."
      />
    ]);
    if (healthCheckCommand)
      items.push([
        "Last checked",
        lastHealthCheckRanAt ? (
          <Inline key="last-checked" gap={8} align="center" wrap={false}>
            <Badge tone={checkFailed ? "bad" : "ok"} dot>
              {checkFailed ? "Failed" : "Passed"}
            </Badge>
            <Meta>{formatDateTime(lastHealthCheckRanAt)}</Meta>
          </Inline>
        ) : (
          <Meta key="last-checked">Never</Meta>
        )
      ]);
    if (checkErrorMessage)
      items.push([
        "Last check error",
        <SyncErrorMessage key="check-error" message={checkErrorMessage} />
      ]);
  }
  if (canRunPostSync)
    items.push([
      "Post-sync command",
      <HostCommandValue
        key="post-sync"
        label="Post-sync command"
        command={postSyncCommand}
        showCommandLabel="Show command"
        dialogDescription="Runs on the destination host after this sync delivers a certificate."
      />
    ]);

  return (
    <Card variant="framed" title="Commands" action={action}>
      <DataList variant="props" density="compact" items={items} />
    </Card>
  );
}
