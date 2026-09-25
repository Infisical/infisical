import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon, LockIcon, RefreshCwIcon } from "lucide-react";

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
import { cn } from "@app/components/v3/utils";
import { OrgPermissionSubjects, useOrganization, useOrgPermission } from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import {
  secretInsightsKeys,
  useGetOrgSecretsDuplication,
  useRefreshOrgSecretsDuplication
} from "@app/hooks/api/secretInsights";

import { DuplicateGroupList } from "./DuplicateGroupList";

// Keeps "Checked N minutes ago" honest while the page sits open.
const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

const CheckedAtButton = ({
  computedAt,
  isRefreshing,
  onRefresh
}: {
  computedAt: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) => {
  const now = useNow(30_000);
  const computed = new Date(computedAt);
  const label =
    now - computed.getTime() < 60_000
      ? "Checked just now"
      : `Checked ${formatDistanceToNow(computed, { addSuffix: true })}`;

  return (
    <Badge variant="neutral" asChild className="ml-2 font-normal">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label={`${label}. Check again`}
      >
        <RefreshCwIcon className={cn(isRefreshing && "animate-spin")} />
        {isRefreshing ? "Checking..." : label}
      </button>
    </Badge>
  );
};

type Props = {
  isPlanRestricted: boolean;
};

export const DuplicatedSecretsCard = ({ isPlanRestricted }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id;
  const { permission } = useOrgPermission();
  const queryClient = useQueryClient();

  const canSearchAllValues = permission.can(
    OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
    OrgPermissionSubjects.SecretsManagementInsights
  );
  const canQuery = canSearchAllValues && !isPlanRestricted;

  const tracking = useOrgSecretValueTracking({
    orgId,
    enabled: canQuery,
    onTrackingOn: () =>
      queryClient.invalidateQueries({ queryKey: secretInsightsKeys.orgSecretsDuplication(orgId) })
  });

  const { data, isPending, isError } = useGetOrgSecretsDuplication(orgId, {
    enabled: canQuery && tracking.isTrackingOn
  });
  const refresh = useRefreshOrgSecretsDuplication();

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
              Upgrade to find secrets that share a value across every project in the organization.
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

    if (!tracking.isTrackingOn) {
      return (
        <SecretValueTrackingPrompt
          tracking={tracking}
          description="Infisical indexes every secret in the organization once, then keeps the index current as secrets change. Secrets stay readable while it runs."
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Duplicated Secrets
          {canQuery && data?.computedAt && (
            <CheckedAtButton
              computedAt={data.computedAt}
              isRefreshing={refresh.isPending}
              onRefresh={() => refresh.mutate({ orgId })}
            />
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
