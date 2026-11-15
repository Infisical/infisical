import { useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { Progress } from "@infisical/cipher/ui/progress";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { SmallText, Text } from "@infisical/cipher/ui/text";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, LayersIcon } from "lucide-react";

import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type {
  TGetOrgSecretValueTrackingStatusResponse,
  TOrgDuplicatedSecretEntry,
  TOrgDuplicatedSecretGroup
} from "@app/hooks/api/secretInsights/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { failed } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { v4Path } from "../../../links";

const FEATURE = "duplicate secret detection";
const overview = v4Path("/organizations/$orgId/projects/secret-management/$projectId/overview");

type Entry = TOrgDuplicatedSecretEntry & { id: string };

const counted = (count: number, noun: string) => `${count} ${count === 1 ? noun : `${noun}s`}`;

const columns: DataTableColumn<Entry>[] = [
  {
    id: "project",
    header: "Project",
    width: 200,
    text: (entry) => entry.projectName,
    render: (entry) => entry.projectName
  },
  {
    id: "key",
    header: "Secret Key",
    primary: true,
    mono: true,
    grow: true,
    minWidth: 240,
    text: (entry) => entry.key,
    render: (entry) => entry.key
  },
  {
    id: "environment",
    header: "Environment",
    width: 160,
    text: (entry) => entry.environment.name,
    render: (entry) => entry.environment.name
  },
  {
    id: "path",
    header: "Path",
    mono: true,
    minWidth: 160,
    maxWidth: 320,
    text: (entry) => entry.secretPath,
    render: (entry) => entry.secretPath
  }
];

const DuplicateGroups = ({ groups }: { groups: TOrgDuplicatedSecretGroup[] }) => {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const { data: memberProjects } = useV4Adapter("projects").useUserProjects();
  const memberProjectIds = useMemo(
    () => new Set(memberProjects?.map((project) => project.id)),
    [memberProjects]
  );

  return (
    <Accordion type="multiple">
      {groups.map((group, groupIndex) => {
        const value = `group-${groupIndex}`;
        const isCrossProject = group.projectCount > 1;
        const rows = group.secrets.map((entry, index) => ({
          ...entry,
          id: `${entry.projectId}-${entry.key}-${entry.environment.slug}-${entry.secretPath}-${index}`
        }));
        return (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger>
              <Inline gap={12} wrap={false}>
                <InlineGrow>
                  <Text>{`${group.secrets.length} secrets share an identical value`}</Text>
                </InlineGrow>
                <Badge tone={isCrossProject ? "accent" : "soft"} icon={LayersIcon}>
                  {isCrossProject
                    ? `${counted(group.projectCount, "Project")}, ${counted(group.locationCount, "Location")}`
                    : counted(group.locationCount, "Location")}
                </Badge>
              </Inline>
            </AccordionTrigger>
            <AccordionContent>
              <DataTable
                label={`Secrets sharing value group ${groupIndex + 1}`}
                rows={rows}
                columns={columns}
                getRowId={(entry) => entry.id}
                rowLabel={(entry) => entry.key}
                rowActions={{
                  inline: [
                    {
                      label: "Go to Secret",
                      icon: ArrowRightIcon,
                      disabledReason: (entry) =>
                        memberProjectIds.has(entry.projectId)
                          ? undefined
                          : "You don't have access to this project",
                      onSelect: (entry) =>
                        navigate({
                          to: overview,
                          params: { orgId, projectId: entry.projectId },
                          search: {
                            secretPath: entry.secretPath,
                            environments: [entry.environment.slug],
                            search: entry.key
                          }
                        })
                    }
                  ]
                }}
              />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};

const TrackingPrompt = ({
  orgId,
  status
}: {
  orgId: string;
  status?: TGetOrgSecretValueTrackingStatusResponse;
}) => {
  const enableTracking = useV4Adapter("secretInsights").useEnableOrgValueTracking();
  const enable = () =>
    enableTracking
      .mutateAsync({ orgId })
      .catch((cause: unknown) => failed(`Couldn't enable ${FEATURE}`, cause));

  if (status?.status === "failed" && !enableTracking.isPending)
    return (
      <EmptyState
        size="sm"
        icon="alert"
        title={`Couldn't enable ${FEATURE}`}
        description={status.message ?? "Unknown error"}
        actions={
          <Button variant="outline" onClick={enable}>
            Retry
          </Button>
        }
      />
    );
  if (status?.status === "pending" || enableTracking.isPending)
    return (
      <Stack gap={8}>
        <Progress
          label={`Enabling ${FEATURE}`}
          value={status?.projectsTotal ? status.projectsDone : null}
          max={status?.projectsTotal || undefined}
          valueLabel={
            status?.projectsTotal
              ? `${status.projectsDone} of ${status.projectsTotal} projects ready`
              : undefined
          }
        />
        <SmallText muted>You can leave this page. This finishes in the background.</SmallText>
      </Stack>
    );
  return (
    <EmptyState
      size="sm"
      icon="search"
      title="Duplicate Secret Detection Is Not Enabled"
      description="Enable duplicate secret detection to locate secrets that share a value across the organization."
      actions={
        <Button variant="primary" onClick={enable}>
          Enable
        </Button>
      }
    />
  );
};

const DuplicatedSecretsBody = ({ orgId }: { orgId: string }) => {
  const insights = useV4Adapter("secretInsights");
  const { data: status, isPending: isStatusPending } = insights.useOrgValueTrackingStatus(orgId);
  const isTrackingOn = status?.status === "completed";
  const { data, isPending, error } = insights.useOrgDuplication(orgId, { enabled: isTrackingOn });

  if (isStatusPending) return <Skeleton height={200} />;
  if (!isTrackingOn) return <TrackingPrompt orgId={orgId} status={status} />;
  if (isPending) return <Skeleton height={280} />;
  if (error)
    return (
      <EmptyState
        size="sm"
        icon="alert"
        title="Duplicated secrets didn't load"
        description="Reload the page to try again."
      />
    );
  if (!data?.groups.length)
    return (
      <EmptyState
        size="sm"
        icon="check-c"
        title="No duplicated secrets found"
        description="No secret shares its value with another anywhere in the organization."
      />
    );
  return <DuplicateGroups groups={data.groups} />;
};

const RefreshBadge = ({ orgId }: { orgId: string }) => {
  const insights = useV4Adapter("secretInsights");
  const { data: status } = insights.useOrgValueTrackingStatus(orgId);
  const isTrackingOn = status?.status === "completed";
  const { data } = insights.useOrgDuplication(orgId, { enabled: isTrackingOn });
  if (!isTrackingOn || data?.remainingTtl == null || data.remainingTtl < 0) return null;
  const minutes = Math.max(1, Math.ceil(data.remainingTtl / 60));
  return <Badge tone="soft">{`Updates in ${counted(minutes, "Minute")}`}</Badge>;
};

export const DuplicatedSecretsCard = () => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const canSearchAllValues = permission.can(
    OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
    OrgPermissionSubjects.SecretsManagementInsights
  );

  return (
    <Card
      variant="framed"
      title="Duplicated Secrets"
      hint="Secrets that share the same value, across every project in the organization."
      badges={canSearchAllValues && <RefreshBadge orgId={orgId} />}
    >
      {canSearchAllValues ? (
        <DuplicatedSecretsBody orgId={orgId} />
      ) : (
        <EmptyState
          size="sm"
          icon="lock"
          title="You don't have access to organization-wide duplicates"
          description="Ask an organization admin for the Search All Secret Values permission under Secrets Management Insights."
        />
      )}
    </Card>
  );
};
