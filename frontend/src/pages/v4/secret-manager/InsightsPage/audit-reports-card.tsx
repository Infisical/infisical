import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, InlineItem } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { formatRelative } from "date-fns";

import {
  ProjectPermissionInsightsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AuditReportStatus, type TAuditReport } from "@app/hooks/api/auditReports/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AUDIT_REPORT_OPTIONS, AUDIT_REPORT_STATUS, auditReportLabel } from "./insights.utils";
import { GenerateReportDialog } from "./shared/generate-report-dialog";

const PAGE_SIZES = [10, 20, 50];

const statusReason = (report: TAuditReport) => {
  if (report.status === AuditReportStatus.Failed) return report.errorMessage ?? undefined;
  if (report.status === AuditReportStatus.Partial)
    return "Some reports reached the row limit and were truncated.";
  return undefined;
};

export const AuditReportsCard = ({ projectId }: { projectId: string }) => {
  const insights = useV4Adapter("secretInsights");
  const { permission } = useProjectPermission(projectId);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [requesting, setRequesting] = useState(false);
  const [deleting, setDeleting] = useState<TAuditReport>();
  const { data, isPending } = insights.useAuditReports({
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage
  });
  const requestReport = insights.useRequestAuditReport();
  const deleteReport = insights.useDeleteAuditReport();
  const reports = data?.reports ?? [];
  const totalCount = data?.totalCount ?? 0;

  const canGenerate = permission.can(
    ProjectPermissionInsightsActions.GenerateReport,
    ProjectPermissionSub.Insights
  );
  const canDelete = permission.can(
    ProjectPermissionInsightsActions.DeleteReport,
    ProjectPermissionSub.Insights
  );

  const columns: DataTableColumn<TAuditReport>[] = [
    {
      id: "reports",
      header: "Reports",
      grow: true,
      primary: true,
      text: (report) => report.reportConfigs.map(({ type }) => auditReportLabel(type)).join(", "),
      render: (report) => {
        const labels = report.reportConfigs.map(({ type }) => auditReportLabel(type));
        if (labels.length <= 1) return <span>{labels[0] ?? ""}</span>;
        return (
          <Tooltip content={labels.join(", ")}>
            <InlineItem truncate>{labels.join(", ")}</InlineItem>
          </Tooltip>
        );
      }
    },
    {
      id: "recipients",
      header: "Recipients",
      width: 280,
      text: (report) => report.emailRecipients.join(", "),
      render: (report) => {
        const [first, ...rest] = report.emailRecipients;
        if (!rest.length) return <span>{first ?? ""}</span>;
        return (
          <Tooltip content={report.emailRecipients.join(", ")}>
            <Inline gap={6} align="center" wrap={false}>
              <InlineItem truncate>{first}</InlineItem>
              <InlineItem shrink={false}>
                <Badge tone="soft">+{rest.length} more</Badge>
              </InlineItem>
            </Inline>
          </Tooltip>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      width: 128,
      text: (report) => AUDIT_REPORT_STATUS[report.status].label,
      render: (report) => {
        const { label, tone } = AUDIT_REPORT_STATUS[report.status];
        const reason = statusReason(report);
        const badge = <Badge tone={tone}>{label}</Badge>;
        return reason ? <Tooltip content={reason}>{badge}</Tooltip> : badge;
      }
    },
    {
      id: "requested",
      header: "Requested",
      width: 200,
      text: (report) => formatRelative(new Date(report.createdAt), new Date()),
      render: (report) => formatRelative(new Date(report.createdAt), new Date())
    }
  ];

  if (!permission.can(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights))
    return null;

  return (
    <Card
      variant="framed"
      title="Reports"
      hint="Compliance reports emailed to your team as CSV attachments."
      flush
      action={
        <Button
          variant="primary"
          icon="plus"
          disabledReason={canGenerate ? undefined : "You don't have permission to generate reports"}
          onClick={() => setRequesting(true)}
        >
          Generate Report
        </Button>
      }
    >
      <DataTable
        label="Reports"
        rows={reports}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(report) => report.id}
        rowLabel={(report) => auditReportLabel(report.reportConfigs[0]?.type)}
        rowActions={{
          menuLabel: "Report options",
          menuDisabledReason: () =>
            canDelete ? undefined : "You don't have permission to delete reports",
          renderMenu: (report) => (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(report)}>
              <Icon name="trash" />
              Delete report
            </DropdownMenuItem>
          )
        }}
        empty={
          <EmptyState
            size="sm"
            icon="file-text"
            title="No reports yet"
            description="Generate a report to have it emailed to your team as a CSV attachment."
          />
        }
        pagination={
          totalCount > PAGE_SIZES[0] ? (
            <Pagination
              label="Report pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={perPage}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(next) => {
                setPerPage(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      {requesting && (
        <GenerateReportDialog
          options={AUDIT_REPORT_OPTIONS}
          onClose={() => setRequesting(false)}
          onSubmit={({ types, emailRecipients }) =>
            requestReport.mutateAsync({
              projectId,
              reports: types.map((type) => ({ type })),
              emailRecipients
            })
          }
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the report from the history. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                try {
                  await deleteReport.mutateAsync({ projectId, auditReportId: deleting.id });
                  saved("Report deleted");
                  if (reports.length === 1 && page > 1) setPage(page - 1);
                  setDeleting(undefined);
                } catch (error) {
                  failed("Couldn't delete the report", error);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
