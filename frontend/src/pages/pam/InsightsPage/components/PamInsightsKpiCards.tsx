import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  InfoIcon,
  KeyRoundIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useOrganization, useProject } from "@app/context";
import { PamResourceType } from "@app/hooks/api/pam/enums";
import { PAM_RESOURCE_TYPE_MAP } from "@app/hooks/api/pam/maps";
import { useGetPamInsightsSummary } from "@app/hooks/api/pamInsights";
import { TPamFailedRotationAccount } from "@app/hooks/api/pamInsights/types";

const knownResourceTypes = Object.values(PamResourceType) as string[];

const accountRoute =
  "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId" as const;

type IconVariant = "warning" | "info" | "success" | "danger";
type FootnoteVariant = "success" | "info" | "danger" | "warning";

type StatCardProps = {
  title: string;
  icon: React.ReactNode;
  iconVariant: IconVariant;
  count: number;
  subtitle: string;
  footnote: React.ReactNode;
  footnoteVariant: FootnoteVariant;
  footnoteTooltip?: React.ReactNode;
  viewLabel?: string;
  to?: string;
  params?: Record<string, string>;
  popoverContent?: React.ReactNode;
  popoverDisabled?: boolean;
};

const FailedRotationsTable = ({
  accounts,
  orgId,
  projectId
}: {
  accounts: TPamFailedRotationAccount[];
  orgId: string;
  projectId: string;
}) => {
  const navigate = useNavigate();
  if (!accounts.length) {
    return <p className="p-4 text-center text-xs text-muted">No failed rotations</p>;
  }
  return (
    <Table containerClassName="max-h-72">
      <TableHeader className="sticky top-0 z-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Resource</TableHead>
          <TableHead>Last Rotated</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const meta = knownResourceTypes.includes(account.resourceType)
            ? PAM_RESOURCE_TYPE_MAP[account.resourceType as PamResourceType]
            : null;
          return (
            <TableRow
              key={account.accountId}
              onClick={() =>
                navigate({
                  to: accountRoute,
                  params: {
                    orgId,
                    projectId,
                    resourceType: account.resourceType,
                    resourceId: account.resourceId,
                    accountId: account.accountId
                  }
                })
              }
            >
              <TableCell className="max-w-[140px] truncate font-medium" title={account.accountName}>
                {account.accountName}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {meta?.image && (
                    <img
                      src={`/images/integrations/${meta.image}`}
                      alt={meta.name}
                      className="size-3.5 shrink-0 object-contain"
                    />
                  )}
                  <span className="max-w-[110px] truncate text-muted" title={account.resourceName}>
                    {account.resourceName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted">
                {account.lastRotatedAt
                  ? formatDistanceToNow(parseISO(account.lastRotatedAt), { addSuffix: true })
                  : "Never"}
              </TableCell>
              <TableCell className="w-8 px-2">
                <ExternalLinkIcon className="size-3.5 text-muted" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const LiveBadge = ({ count }: { count: number }) => (
  <Badge variant="success" className="animate-pulse">
    <ActivityIcon />
    {count === 1 ? "1 session live" : `${count} sessions live`}
  </Badge>
);

const renderFootnoteIcon = (variant: FootnoteVariant) => {
  if (variant === "success") return <CheckIcon />;
  if (variant === "danger" || variant === "warning") return <AlertTriangleIcon />;
  return <InfoIcon />;
};

const computeResourcesFootnote = (totalResources: number, resourcesWithRotation: number) => {
  if (totalResources === 0) {
    return { text: "No resources yet", variant: "info" as const };
  }
  const pct = (resourcesWithRotation / totalResources) * 100;
  const text = `${resourcesWithRotation} of ${totalResources} with rotation`;
  if (pct === 100) return { text: "All resources covered", variant: "success" as const };
  if (pct >= 50) return { text, variant: "warning" as const };
  return { text, variant: "danger" as const };
};

const computeAccountsFootnote = (totalAccounts: number, failedRotations: number) => {
  if (totalAccounts === 0) {
    return { text: "No accounts yet", variant: "info" as const };
  }
  if (failedRotations > 0) {
    return {
      text: `${failedRotations} failed rotation${failedRotations === 1 ? "" : "s"}`,
      variant: "danger" as const
    };
  }
  return { text: "All rotations healthy", variant: "success" as const };
};

const StatCard = ({
  title,
  icon,
  iconVariant,
  count,
  subtitle,
  footnote,
  footnoteVariant,
  footnoteTooltip,
  viewLabel,
  to,
  params,
  popoverContent,
  popoverDisabled
}: StatCardProps) => {
  const navigate = useNavigate();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const renderBadge = () => {
    if (typeof footnote !== "string") return footnote;
    const badge = (
      <Badge variant={footnoteVariant}>
        {renderFootnoteIcon(footnoteVariant)}
        {footnote}
      </Badge>
    );
    if (!footnoteTooltip) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {footnoteTooltip}
        </TooltipContent>
      </Tooltip>
    );
  };
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
              iconVariant === "info" && "border-info/15 bg-info/10 text-info",
              iconVariant === "warning" && "border-warning/15 bg-warning/10 text-warning",
              iconVariant === "success" && "border-success/15 bg-success/10 text-success",
              iconVariant === "danger" && "border-danger/15 bg-danger/10 text-danger"
            )}
          >
            {icon}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <span className="text-2xl font-semibold">{count.toLocaleString()}</span>
          <span className="ml-2 text-sm text-muted">{subtitle}</span>
        </div>
        <Separator />
        <div className="flex min-h-7 items-center justify-between">
          {renderBadge()}
          {popoverContent && viewLabel ? (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="xs" disabled={popoverDisabled}>
                  {viewLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[480px] p-0" align="end">
                {popoverContent}
              </PopoverContent>
            </Popover>
          ) : (
            viewLabel &&
            to &&
            params &&
            count > 0 && (
              <Button variant="outline" size="xs" onClick={() => navigate({ to, params })}>
                {viewLabel}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const PamInsightsKpiCards = () => {
  const { currentOrg } = useOrganization();
  const { projectId } = useProject();
  const { data, isPending } = useGetPamInsightsSummary({ projectId }, { enabled: !!projectId });
  const params = { orgId: currentOrg.id, projectId };

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row">
        <Skeleton className="h-[183px] flex-1" />
        <Skeleton className="h-[183px] flex-1" />
        <Skeleton className="h-[183px] flex-1" />
      </div>
    );
  }

  const totalResources = data?.totalResources ?? 0;
  const resourcesWithRotation = data?.resourcesWithRotation ?? 0;
  const totalAccounts = data?.totalAccounts ?? 0;
  const failedRotations = data?.failedRotations ?? 0;
  const failedRotationAccounts = data?.failedRotationAccounts ?? [];
  const activeSessions = data?.activeSessions ?? 0;
  const resourceTypeCount = data?.resourceTypeCount ?? 0;

  const resourcesFootnote = computeResourcesFootnote(totalResources, resourcesWithRotation);
  const accountsFootnote = computeAccountsFootnote(totalAccounts, failedRotations);

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <StatCard
        title="Total Resources"
        icon={<DatabaseIcon />}
        iconVariant="info"
        count={totalResources}
        subtitle={`Across ${resourceTypeCount} resource types`}
        footnote={resourcesFootnote.text}
        footnoteVariant={resourcesFootnote.variant}
        footnoteTooltip={
          totalResources > 0
            ? "Rotation reduces credential exposure by replacing account passwords on a regular schedule. We recommend configuring rotation on every resource."
            : undefined
        }
        viewLabel="View Resources"
        to="/organizations/$orgId/projects/pam/$projectId/resources"
        params={params}
      />
      <StatCard
        title="Total Accounts"
        icon={<KeyRoundIcon />}
        iconVariant="warning"
        count={totalAccounts}
        subtitle="Privileged credentials"
        footnote={accountsFootnote.text}
        footnoteVariant={accountsFootnote.variant}
        viewLabel={failedRotations > 0 ? "View Failed Rotations" : undefined}
        popoverContent={
          failedRotations > 0 ? (
            <FailedRotationsTable
              accounts={failedRotationAccounts}
              orgId={currentOrg.id}
              projectId={projectId}
            />
          ) : undefined
        }
        popoverDisabled={failedRotations === 0}
      />
      <StatCard
        title="Active Sessions"
        icon={<ActivityIcon />}
        iconVariant="success"
        count={activeSessions}
        subtitle="Currently live"
        footnote={activeSessions > 0 ? <LiveBadge count={activeSessions} /> : "No active sessions"}
        footnoteVariant="info"
        viewLabel="View Sessions"
        to="/organizations/$orgId/projects/pam/$projectId/sessions"
        params={params}
      />
    </div>
  );
};
