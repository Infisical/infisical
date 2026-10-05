import { AlertTriangleIcon, LockIcon } from "lucide-react";

import {
  SecretValueTrackingPrompt,
  useOrgSecretValueTracking
} from "@app/components/secrets/SecretValueTrackingGate";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization, useOrgPermission } from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import { useGetOrgSecretsDuplication } from "@app/hooks/api/secretInsights";

import { DuplicateGroupList } from "./DuplicateGroupList";

type Props = {
  isPlanRestricted: boolean;
};

export const DuplicatedSecretsCard = ({ isPlanRestricted }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id;
  const { permission } = useOrgPermission();

  const canSearchAllValues = permission.can(
    OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
    OrgPermissionSubjects.SecretsManagementInsights
  );
  const canQuery = canSearchAllValues && !isPlanRestricted;

  const tracking = useOrgSecretValueTracking({ orgId, enabled: canQuery });

  const { data, isPending, isError } = useGetOrgSecretsDuplication(orgId, {
    enabled: canQuery && tracking.isTrackingOn
  });

  const renderBody = () => {
    if (isPlanRestricted) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>Duplicate detection is not on your current plan</EmptyTitle>
            <EmptyDescription>
              Upgrade to locate secrets that share a value across every project in the organization.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (!canSearchAllValues) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>You don&apos;t have access to organization-wide duplicates</EmptyTitle>
            <EmptyDescription>
              Ask an organization admin for the Search All Secret Values permission under Secrets
              Management Insights.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (!tracking.isReady) {
      return (
        <SecretValueTrackingPrompt
          tracking={tracking}
          featureName="duplicate secret detection"
          description="Enable duplicate secret detection to locate secrets that share a value across the organization."
        />
      );
    }

    if (isPending) return <Skeleton className="h-[280px] w-full" />;

    if (isError) {
      return (
        <div className="flex h-[200px] flex-col items-center justify-center gap-3">
          <AlertTriangleIcon className="size-6 text-danger" />
          <p className="text-sm text-danger">Could not load duplicated secrets.</p>
        </div>
      );
    }

    const groups = data?.groups ?? [];

    if (groups.length === 0) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No duplicated secrets found</EmptyTitle>
            <EmptyDescription>
              No secret shares its value with another anywhere in the organization.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return <DuplicateGroupList groups={groups} />;
  };

  const remainingMinutes =
    canQuery && data?.remainingTtl != null && data.remainingTtl >= 0
      ? Math.max(1, Math.ceil(data.remainingTtl / 60))
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Duplicated Secrets
          {remainingMinutes != null && (
            <Badge variant="neutral" className="ml-2 font-normal">
              Updates in {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Secrets that share the same value, across every project in the organization
        </CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
