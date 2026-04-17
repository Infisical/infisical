import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  Skeleton,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton,
  UnstableSeparator,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
              <PopoverContent className="w-[480px] p-0" align="end">
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

type RotationItem = {
  name: string;
  environment: string;
  secretPath: string;
  nextRotationAt: string | null;
};

const RotationTable = ({
  failed,
  upcoming,
  orgId,
  projectId
}: {
  failed: RotationItem[];
  upcoming: RotationItem[];
  orgId: string;
  projectId: string;
}) => {
  const navigate = useNavigate();
  const allItems = [
    ...failed.map((item) => ({ ...item, status: "failed" as const })),
    ...upcoming.map((item) => ({ ...item, status: "upcoming" as const }))
  ];

  if (!allItems.length) return <p className="p-4 text-center text-xs text-muted">No rotations</p>;

  return (
    <UnstableTable containerClassName="max-h-72">
      <UnstableTableHeader className="sticky top-0 z-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
        <UnstableTableRow>
          <UnstableTableHead>Name</UnstableTableHead>
          <UnstableTableHead>Env</UnstableTableHead>
          <UnstableTableHead>Path</UnstableTableHead>
          <UnstableTableHead>Status</UnstableTableHead>
          <UnstableTableHead className="w-8" />
        </UnstableTableRow>
      </UnstableTableHeader>
      <UnstableTableBody>
        {allItems.map((item) => (
          <UnstableTableRow
            key={`${item.status}-${item.name}-${item.environment}`}
            onClick={() =>
              navigate({
                to: overviewRoute,
                params: { orgId, projectId },
                search: {
                  search: item.name,
                  environments: [item.environment],
                  filterBy: "rotation"
                }
              })
            }
          >
            <UnstableTableCell className="max-w-[120px] truncate font-medium" title={item.name}>
              {item.name}
            </UnstableTableCell>
            <UnstableTableCell className="text-muted" title={item.environment}>
              {item.environment}
            </UnstableTableCell>
            <UnstableTableCell
              className="max-w-[100px] truncate text-muted"
              title={item.secretPath}
            >
              {item.secretPath}
            </UnstableTableCell>
            <UnstableTableCell>
              {item.status === "failed" ? (
                <Badge variant="danger">
                  {item.nextRotationAt
                    ? `retries ${formatDistanceToNow(parseISO(item.nextRotationAt), { addSuffix: true })}`
                    : "failed"}
                </Badge>
              ) : (
                <Badge variant="info">
                  {item.nextRotationAt
                    ? formatDistanceToNow(parseISO(item.nextRotationAt), { addSuffix: true })
                    : "scheduled"}
                </Badge>
              )}
            </UnstableTableCell>
            <UnstableTableCell className="w-8 px-2">
              <ExternalLinkIcon className="size-3.5 text-muted" />
            </UnstableTableCell>
          </UnstableTableRow>
        ))}
      </UnstableTableBody>
    </UnstableTable>
  );
};

type ReminderItem = {
  secretKey: string;
  environment: string;
  secretPath: string;
  nextReminderDate: string;
};

const ReminderTable = ({
  overdue,
  upcoming,
  orgId,
  projectId
}: {
  overdue: ReminderItem[];
  upcoming: ReminderItem[];
  orgId: string;
  projectId: string;
}) => {
  const navigate = useNavigate();
  const allItems = [
    ...overdue.map((item) => ({ ...item, status: "overdue" as const })),
    ...upcoming.map((item) => ({ ...item, status: "upcoming" as const }))
  ];

  if (!allItems.length) return <p className="p-4 text-center text-xs text-muted">No reminders</p>;

  return (
    <UnstableTable containerClassName="max-h-72">
      <UnstableTableHeader className="sticky top-0 z-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
        <UnstableTableRow>
          <UnstableTableHead>Secret</UnstableTableHead>
          <UnstableTableHead>Env</UnstableTableHead>
          <UnstableTableHead>Path</UnstableTableHead>
          <UnstableTableHead>Due</UnstableTableHead>
          <UnstableTableHead className="w-8" />
        </UnstableTableRow>
      </UnstableTableHeader>
      <UnstableTableBody>
        {allItems.map((item) => (
          <UnstableTableRow
            key={`${item.status}-${item.secretKey}-${item.environment}`}
            onClick={() =>
              navigate({
                to: overviewRoute,
                params: { orgId, projectId },
                search: {
                  search: item.secretKey,
                  environments: [item.environment],
                  filterBy: "secret"
                }
              })
            }
          >
            <UnstableTableCell
              className="max-w-[120px] truncate font-medium"
              title={item.secretKey}
            >
              {item.secretKey}
            </UnstableTableCell>
            <UnstableTableCell className="text-muted" title={item.environment}>
              {item.environment}
            </UnstableTableCell>
            <UnstableTableCell
              className="max-w-[100px] truncate text-muted"
              title={item.secretPath}
            >
              {item.secretPath}
            </UnstableTableCell>
            <UnstableTableCell>
              <Badge variant={item.status === "overdue" ? "danger" : "warning"}>
                {formatDistanceToNow(parseISO(item.nextReminderDate), { addSuffix: true })}
              </Badge>
            </UnstableTableCell>
            <UnstableTableCell className="w-8 px-2">
              <ExternalLinkIcon className="size-3.5 text-muted" />
            </UnstableTableCell>
          </UnstableTableRow>
        ))}
      </UnstableTableBody>
    </UnstableTable>
  );
};

const PAGE_SIZE = 10;

const StaleSecretsTable = ({
  items,
  totalCount,
  page,
  onPageChange,
  orgId,
  projectId
}: {
  items: { key: string; environment: string; secretPath: string; updatedAt: string }[];
  totalCount: number;
  page: number;
  onPageChange: (p: number) => void;
  orgId: string;
  projectId: string;
}) => {
  const navigate = useNavigate();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!totalCount) return <p className="p-4 text-center text-xs text-muted">No stale secrets</p>;

  return (
    <div>
      <UnstableTable containerClassName={twMerge("max-h-72", totalPages && "rounded-b-none")}>
        <UnstableTableHeader className="sticky top-0 z-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
          <UnstableTableRow>
            <UnstableTableHead>Secret</UnstableTableHead>
            <UnstableTableHead>Env</UnstableTableHead>
            <UnstableTableHead>Path</UnstableTableHead>
            <UnstableTableHead>Last Modified</UnstableTableHead>
            <UnstableTableHead className="w-8" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {items.map((item) => (
            <UnstableTableRow
              key={`${item.key}-${item.environment}-${item.secretPath}`}
              onClick={() =>
                navigate({
                  to: overviewRoute,
                  params: { orgId, projectId },
                  search: {
                    search: item.key,
                    environments: [item.environment],
                    filterBy: "secret"
                  }
                })
              }
            >
              <UnstableTableCell className="max-w-[120px] truncate font-medium" title={item.key}>
                {item.key}
              </UnstableTableCell>
              <UnstableTableCell className="text-muted" title={item.environment}>
                {item.environment}
              </UnstableTableCell>
              <UnstableTableCell
                className="max-w-[100px] truncate text-muted"
                title={item.secretPath}
              >
                {item.secretPath}
              </UnstableTableCell>
              <UnstableTableCell className="text-muted">
                {formatDistanceToNow(parseISO(item.updatedAt), { addSuffix: true })}
              </UnstableTableCell>
              <UnstableTableCell className="w-8 px-2">
                <ExternalLinkIcon className="size-3.5 text-muted" />
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border bg-container px-3 py-2">
          <span className="text-xs text-muted">
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
            {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <UnstableIconButton
              variant="ghost"
              size="xs"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeftIcon className="size-3.5" />
            </UnstableIconButton>
            <UnstableIconButton
              variant="ghost"
              size="xs"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRightIcon className="size-3.5" />
            </UnstableIconButton>
          </div>
        </div>
      )}
    </div>
  );
};

export const InsightsSummaryCards = () => {
  const { projectId } = useProject();
  const { orgId } = useParams({
    strict: false,
    select: (p) => ({ orgId: (p as Record<string, string>).orgId })
  });

  const [stalePage, setStalePage] = useState(0);

  const { data, isPending } = useGetInsightsSummary(
    {
      projectId,
      staleSecretsOffset: stalePage * PAGE_SIZE,
      staleSecretsLimit: PAGE_SIZE
    },
    { enabled: !!projectId, placeholderData: (prev) => prev }
  );

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
  const totalStaleCount = data?.totalStaleCount ?? staleSecrets.length;

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
          <RotationTable
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
          <ReminderTable
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
        count={totalStaleCount}
        totalItems={totalStaleCount}
        subtitle="Unmodified > 90 days"
        footnote={
          totalStaleCount
            ? `${totalStaleCount} need${totalStaleCount === 1 ? "s" : ""} review`
            : "All secrets up to date"
        }
        footnoteVariant={totalStaleCount ? "warning" : "success"}
        viewLabel="View Stale Secrets"
        popoverContent={
          <StaleSecretsTable
            items={staleSecrets}
            totalCount={totalStaleCount}
            page={stalePage}
            onPageChange={setStalePage}
            orgId={orgId}
            projectId={projectId}
          />
        }
      />
    </div>
  );
};
