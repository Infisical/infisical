import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Skeleton,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableSeparator
} from "@app/components/v3";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { useGetInsightsSummary } from "@app/hooks/api";

type StatCardProps = {
  title: string;
  icon: React.ReactNode;
  iconVariant: "warning" | "info" | "danger";
  count: number;
  totalItems: number;
  subtitle: string;
  footnote: string;
  footnoteVariant: "warning" | "danger" | "success";
  viewLabel: string;
  popoverContent?: React.ReactNode;
};

const StatCard = ({
  title,
  icon,
  iconVariant,
  count,
  totalItems,
  subtitle,
  footnote,
  footnoteVariant,
  viewLabel,
  popoverContent
}: StatCardProps) => {
  const [open, setOpen] = useState(false);

  return (
    <UnstableCard className="flex-1">
      <UnstableCardHeader>
        <UnstableCardTitle>{title}</UnstableCardTitle>
        <UnstableCardAction>
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
              iconVariant === "info" && "border-info/15 bg-info/10 text-info",
              iconVariant === "warning" && "border-warning/15 bg-warning/10 text-warning",
              iconVariant === "danger" && "border-danger/15 bg-danger/10 text-danger"
            )}
          >
            {icon}
          </div>
        </UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-col gap-3">
        <div>
          <span className="text-2xl font-semibold">{count}</span>
          <span className="ml-2 text-sm text-muted">{subtitle}</span>
        </div>
        <UnstableSeparator />
        <div className="flex items-center justify-between">
          <Badge variant={footnoteVariant}>
            {footnoteVariant === "success" ? <CheckIcon /> : <AlertTriangleIcon />}
            {footnote}
          </Badge>
          {popoverContent && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="xs" disabled={totalItems === 0}>
                  {viewLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                {popoverContent}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </UnstableCardContent>
    </UnstableCard>
  );
};

const overviewRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;

const RotationCommandList = ({
  failed,
  upcoming,
  orgId,
  projectId
}: {
  failed: {
    name: string;
    environment: string;
    secretPath: string;
    nextRotationAt: string | null;
  }[];
  upcoming: {
    name: string;
    environment: string;
    secretPath: string;
    nextRotationAt: string | null;
  }[];
  orgId: string;
  projectId: string;
}) => (
  <Command>
    <CommandList className="max-h-64">
      <CommandEmpty>No rotations found</CommandEmpty>
      {failed.length > 0 && (
        <CommandGroup heading="Failed">
          {failed.map((item) => (
            <CommandItem key={`failed-${item.name}-${item.environment}`} asChild>
              <Link
                to={overviewRoute}
                params={{ orgId, projectId }}
                search={{
                  search: item.name,
                  environments: [item.environment],
                  filterBy: "rotation"
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.name}</div>
                  <div className="truncate text-xs text-label">
                    {item.nextRotationAt
                      ? `retries ${formatDistanceToNow(parseISO(item.nextRotationAt), { addSuffix: true })} — `
                      : ""}
                    {item.environment} · {item.secretPath}
                  </div>
                </div>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted" />
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {upcoming.length > 0 && (
        <CommandGroup heading="Upcoming">
          {upcoming.map((item) => (
            <CommandItem key={`upcoming-${item.name}-${item.environment}`} asChild>
              <Link
                to={overviewRoute}
                params={{ orgId, projectId }}
                search={{
                  search: item.name,
                  environments: [item.environment],
                  filterBy: "rotation"
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.name}</div>
                  <div className="truncate text-xs text-label">
                    {item.nextRotationAt &&
                      `${formatDistanceToNow(parseISO(item.nextRotationAt), { addSuffix: true })} — `}
                    {item.environment} · {item.secretPath}
                  </div>
                </div>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted" />
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  </Command>
);

const ReminderCommandList = ({
  overdue,
  upcoming,
  orgId,
  projectId
}: {
  overdue: {
    secretKey: string;
    environment: string;
    secretPath: string;
    nextReminderDate: string;
  }[];
  upcoming: {
    secretKey: string;
    environment: string;
    secretPath: string;
    nextReminderDate: string;
  }[];
  orgId: string;
  projectId: string;
}) => (
  <Command>
    <CommandList className="max-h-64">
      <CommandEmpty>No reminders found</CommandEmpty>
      {overdue.length > 0 && (
        <CommandGroup heading="Overdue">
          {overdue.map((item) => (
            <CommandItem key={`overdue-${item.secretKey}-${item.environment}`} asChild>
              <Link
                to={overviewRoute}
                params={{ orgId, projectId }}
                search={{
                  search: item.secretKey,
                  environments: [item.environment],
                  filterBy: "secret"
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.secretKey}</div>
                  <div className="truncate text-xs text-label">
                    {formatDistanceToNow(parseISO(item.nextReminderDate), { addSuffix: true })} —{" "}
                    {item.environment} · {item.secretPath}
                  </div>
                </div>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted" />
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {upcoming.length > 0 && (
        <CommandGroup heading="Upcoming">
          {upcoming.map((item) => (
            <CommandItem key={`upcoming-${item.secretKey}-${item.environment}`} asChild>
              <Link
                to={overviewRoute}
                params={{ orgId, projectId }}
                search={{
                  search: item.secretKey,
                  environments: [item.environment],
                  filterBy: "secret"
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.secretKey}</div>
                  <div className="truncate text-xs text-label">
                    {formatDistanceToNow(parseISO(item.nextReminderDate), { addSuffix: true })} —{" "}
                    {item.environment} · {item.secretPath}
                  </div>
                </div>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted" />
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  </Command>
);

const StaleSecretCommandList = ({
  items,
  orgId,
  projectId
}: {
  items: { key: string; environment: string; secretPath: string; updatedAt: string }[];
  orgId: string;
  projectId: string;
}) => (
  <Command>
    <CommandList className="max-h-64">
      <CommandEmpty>No stale secrets found</CommandEmpty>
      <CommandGroup heading="Needs Review">
        {items.map((item) => (
          <CommandItem key={`stale-${item.key}-${item.environment}`} asChild>
            <Link
              to={overviewRoute}
              params={{ orgId, projectId }}
              search={{ search: item.key, environments: [item.environment], filterBy: "secret" }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{item.key}</div>
                <div className="truncate text-xs text-label">
                  {formatDistanceToNow(parseISO(item.updatedAt), { addSuffix: true })} —{" "}
                  {item.environment} · {item.secretPath}
                </div>
              </div>
              <ExternalLinkIcon className="size-3.5 shrink-0 text-muted" />
            </Link>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  </Command>
);

export const InsightsSummaryCards = () => {
  const { projectId } = useProject();
  const { orgId } = useParams({
    strict: false,
    select: (p) => ({ orgId: (p as Record<string, string>).orgId })
  });

  const { data, isPending } = useGetInsightsSummary({ projectId }, { enabled: !!projectId });

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row">
        <Skeleton className="h-[183px] flex-1" />
        <Skeleton className="h-[183px] flex-1" />
        <Skeleton className="h-[183px] flex-1" />
      </div>
    );
  }

  const upcomingRotations = data?.upcomingRotations ?? [];
  const failedRotations = data?.failedRotations ?? [];
  const upcomingReminders = data?.upcomingReminders ?? [];
  const overdueReminders = data?.overdueReminders ?? [];
  const staleSecrets = data?.staleSecrets ?? [];

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <StatCard
        title="Upcoming Rotations"
        icon={<RefreshCwIcon />}
        iconVariant="info"
        count={upcomingRotations.length}
        totalItems={upcomingRotations.length + failedRotations.length}
        subtitle="In the next 7 days"
        footnote={
          failedRotations.length ? `${failedRotations.length} failed` : "No failed rotations"
        }
        footnoteVariant={failedRotations.length ? "danger" : "success"}
        viewLabel={failedRotations.length ? "View Failed Rotations" : "View Rotations"}
        popoverContent={
          <RotationCommandList
            failed={failedRotations}
            upcoming={upcomingRotations}
            orgId={orgId}
            projectId={projectId}
          />
        }
      />
      <StatCard
        title="Upcoming Reminders"
        icon={<BellIcon />}
        iconVariant="warning"
        count={upcomingReminders.length}
        totalItems={upcomingReminders.length + overdueReminders.length}
        subtitle="In the next 7 days"
        footnote={
          overdueReminders.length ? `${overdueReminders.length} overdue` : "No overdue reminders"
        }
        footnoteVariant={overdueReminders.length ? "danger" : "success"}
        viewLabel={overdueReminders.length ? "View Overdue Reminders" : "View Upcoming Reminders"}
        popoverContent={
          <ReminderCommandList
            overdue={overdueReminders}
            upcoming={upcomingReminders}
            orgId={orgId}
            projectId={projectId}
          />
        }
      />
      <StatCard
        title="Stale Secrets"
        icon={<ClockIcon />}
        iconVariant="danger"
        count={staleSecrets.length}
        totalItems={staleSecrets.length}
        subtitle="Unmodified > 90 days"
        footnote={
          staleSecrets.length
            ? `${staleSecrets.length} need${staleSecrets.length === 1 ? "s" : ""} review`
            : "All secrets up to date"
        }
        footnoteVariant={staleSecrets.length ? "warning" : "success"}
        viewLabel="View Stale Secrets"
        popoverContent={
          <StaleSecretCommandList items={staleSecrets} orgId={orgId} projectId={projectId} />
        }
      />
    </div>
  );
};
