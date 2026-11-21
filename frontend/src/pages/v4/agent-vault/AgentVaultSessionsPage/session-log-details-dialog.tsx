import { Badge } from "@infisical/cipher/ui/badge";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Meta, SmallText } from "@infisical/cipher/ui/text";
import { format } from "date-fns";

import type { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import {
  decisionPresentation,
  groupRepeatedMcpCalls,
  httpStatusLabel,
  isNativeSessionLogRecord,
  isProxyAnswered,
  isSessionEndpoint,
  nativeSessionLogSections,
  outcomeDescription,
  sessionLogAddress,
  sessionLogMcpCalls,
  sessionLogMethodLabel
} from "./session-logs";

const recordItems = (record: TAgentVaultSessionLogRecord): DataListItem[] => {
  const isNative = isNativeSessionLogRecord(record);
  const { label, tone, icon } = decisionPresentation(record.decision);
  const isDescribed = isProxyAnswered(record.decision) || isSessionEndpoint(record.decision);
  const hasHttpStatus = !isNative && !isProxyAnswered(record.decision) && Boolean(record.status);
  const items: (DataListItem | false)[] = [
    [
      "Outcome",
      <Stack key="outcome" gap={4}>
        <Badge tone={tone} icon={icon}>
          {label}
        </Badge>
        {isDescribed && record.status ? (
          <SmallText muted>{outcomeDescription(record)}</SmallText>
        ) : null}
      </Stack>
    ],
    [
      "Time",
      <Meta key="time">{format(new Date(record.ts), "MMM dd, yyyy HH:mm:ss.SSS (zzz)")}</Meta>
    ],
    ["Method", <Meta key="method">{sessionLogMethodLabel(record)}</Meta>],
    ["Address", <Meta key="address">{sessionLogAddress(record)}</Meta>],
    Boolean(record.service) && ["Service", record.service],
    !isNative && ["Path", <Meta key="path">{record.path || "/"}</Meta>],
    hasHttpStatus && ["Upstream", `${record.host} returned ${httpStatusLabel(record.status)}`],
    Boolean(record.accessBundle) && ["Access bundle", record.accessBundle],
    Boolean(record.hook) && [
      "Hook",
      [record.hook?.decision, record.hook?.reason ?? record.hook?.cause].filter(Boolean).join(": ")
    ]
  ];
  return items.filter((item): item is DataListItem => Boolean(item));
};

const McpCalls = ({ record }: { record: TAgentVaultSessionLogRecord }) => {
  const calls = sessionLogMcpCalls(record);
  if (!calls.length) return null;
  return (
    <Stack gap={4}>
      <CodeBlock
        label="MCP calls"
        code={groupRepeatedMcpCalls(calls)
          .map(({ label, count }) => (count > 1 ? `${label} x${count}` : label))
          .join("\n")}
      />
      {record.mcp?.truncated && (
        <SmallText muted>More calls in this request weren&apos;t recorded.</SmallText>
      )}
    </Stack>
  );
};

const NativeSections = ({ record }: { record: TAgentVaultSessionLogRecord }) => {
  const { native } = record;
  if (!native) return null;
  return (
    <Stack gap={12}>
      {nativeSessionLogSections(native).map((section) => (
        <CodeBlock
          key={section.label}
          label={section.isError ? `${section.label} (failed)` : section.label}
          code={section.value}
          wrap
          maxHeight={240}
        />
      ))}
      {native.note && <SmallText muted>{native.note}</SmallText>}
      {native.truncated && (
        <SmallText muted>Longer text was cut short when it was recorded.</SmallText>
      )}
    </Stack>
  );
};

export const SessionLogDetailsDialog = ({
  record,
  onClose
}: {
  record: TAgentVaultSessionLogRecord | null;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      {record && (
        <>
          <DialogHeader>
            <DialogTitle>
              {isNativeSessionLogRecord(record) && record.service ? record.service : record.host}
            </DialogTitle>
            <DialogDescription>
              {format(new Date(record.ts), "MMM d, yyyy h:mm:ss a")}
            </DialogDescription>
          </DialogHeader>
          <Stack gap={16}>
            <DataList variant="props" items={recordItems(record)} />
            <McpCalls record={record} />
            <NativeSections record={record} />
          </Stack>
        </>
      )}
    </DialogContent>
  </Dialog>
);
