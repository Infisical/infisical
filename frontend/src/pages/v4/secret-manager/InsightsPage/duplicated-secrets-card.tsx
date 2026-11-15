import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, InlineGrow, InlineItem } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import type {
  TDuplicatedSecretEntry,
  TDuplicatedSecretGroup
} from "@app/hooks/api/secretInsights/types";

import { failed } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { overviewLink, plural } from "./insights.utils";

const DuplicateGroups = ({
  orgId,
  projectId,
  groups
}: {
  orgId: string;
  projectId: string;
  groups: TDuplicatedSecretGroup[];
}) => (
  <Accordion type="multiple">
    {groups.map((group, groupIndex) => {
      const locations = new Set(
        group.secrets.map((secret) => `${secret.environment.slug}:${secret.secretPath}`)
      ).size;
      const value = `group-${groupIndex}`;
      return (
        <AccordionItem key={value} value={value}>
          <AccordionTrigger>
            <Inline gap={8} justify="between" wrap={false}>
              <InlineGrow>{group.secrets.length} secrets share an identical value</InlineGrow>
              <InlineItem shrink={false}>
                <Badge tone="soft" icon="folder">
                  {plural(locations, "location")}
                </Badge>
              </InlineItem>
            </Inline>
          </AccordionTrigger>
          <AccordionContent>
            <DataTable<TDuplicatedSecretEntry>
              label={`Secrets in duplicate group ${groupIndex + 1}`}
              rows={group.secrets}
              getRowId={(entry) => `${entry.key}:${entry.environment.slug}:${entry.secretPath}`}
              rowLabel={(entry) => entry.key}
              columns={[
                {
                  id: "key",
                  header: "Secret Key",
                  primary: true,
                  grow: true,
                  mono: true,
                  text: (entry) => entry.key,
                  render: (entry) => (
                    <RowLink
                      title={entry.key}
                      link={overviewLink(orgId, projectId, {
                        secretPath: entry.secretPath,
                        environments: [entry.environment.slug]
                      })}
                    >
                      {entry.key}
                    </RowLink>
                  )
                },
                {
                  id: "environment",
                  header: "Environment",
                  width: 160,
                  text: (entry) => entry.environment.name,
                  render: (entry) => <Badge tone="info">{entry.environment.name}</Badge>
                },
                {
                  id: "path",
                  header: "Path",
                  width: 240,
                  mono: true,
                  text: (entry) => entry.secretPath,
                  render: (entry) => entry.secretPath
                }
              ]}
            />
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

const DetectionStatus = ({
  migrationStatus,
  message,
  triggered,
  isEnabling,
  onEnable
}: {
  migrationStatus?: string;
  message?: string;
  triggered: boolean;
  isEnabling: boolean;
  onEnable: () => void;
}) => {
  if (migrationStatus === "failed" && !isEnabling)
    return (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't index secrets"
        description={message ?? "Unknown error"}
        actions={
          <Button variant="outline" onClick={onEnable}>
            Retry
          </Button>
        }
      />
    );
  if ((triggered || migrationStatus === "pending") && migrationStatus !== "failed")
    return (
      <Loader
        label="Indexing secrets for duplicate detection"
        description="This may take a moment."
      />
    );
  return (
    <EmptyState
      size="sm"
      icon="copy"
      title="Secret duplication detection is not enabled"
      description="Enable detection to find secrets that share the same value across environments and paths."
      actions={
        <Button variant="primary" loading={isEnabling} onClick={onEnable}>
          Enable Detection
        </Button>
      }
    />
  );
};

export const DuplicatedSecretsCard = ({
  orgId,
  projectId
}: {
  orgId: string;
  projectId: string;
}) => {
  const insights = useV4Adapter("secretInsights");
  const [triggered, setTriggered] = useState(false);
  const enableBlindIndex = insights.useEnableBlindIndex();
  const refreshDuplication = insights.useRefreshSecretsDuplication();
  const { data, isPending } = insights.useSecretsDuplication(projectId);
  const groups = data?.groups ?? [];
  const blindIndexEnabled = data?.secretBlindIndexEnabled ?? true;
  const { data: status } = insights.useBlindIndexStatus(projectId, {
    enabled: !isPending && !blindIndexEnabled
  });
  const migrationStatus = status?.status;

  useEffect(() => {
    if (migrationStatus === "completed" && !blindIndexEnabled) refreshDuplication(projectId);
  }, [migrationStatus, blindIndexEnabled, projectId, refreshDuplication]);

  const enable = async () => {
    setTriggered(true);
    try {
      await enableBlindIndex.mutateAsync({ projectId });
    } catch (error) {
      setTriggered(false);
      failed("Couldn't enable duplicate detection", error);
    }
  };

  const remainingMinutes =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? Math.max(1, Math.ceil(data.remainingTtl / 60))
      : null;

  let body;
  if (isPending) body = <Skeleton height={280} />;
  else if (!blindIndexEnabled)
    body = (
      <DetectionStatus
        migrationStatus={migrationStatus}
        message={status?.message}
        triggered={triggered}
        isEnabling={enableBlindIndex.isPending}
        onEnable={enable}
      />
    );
  else if (groups.length === 0)
    body = (
      <EmptyState
        size="sm"
        icon="check-c"
        title="No duplicated secrets found"
        description="All secrets across environments and paths have unique values."
      />
    );
  else body = <DuplicateGroups orgId={orgId} projectId={projectId} groups={groups} />;

  return (
    <Card
      title="Duplicated Secrets"
      badges={
        blindIndexEnabled && remainingMinutes != null ? (
          <Badge tone="soft">
            Updates in {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"}
          </Badge>
        ) : undefined
      }
      description="Secrets that share the same value across environments and paths."
    >
      {body}
    </Card>
  );
};
