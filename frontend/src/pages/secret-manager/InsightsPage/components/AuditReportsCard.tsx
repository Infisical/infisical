import { formatRelative } from "date-fns";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionInsightsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  AuditReportStatus,
  TAuditReport,
  useDeleteAuditReport,
  useGetAuditReports
} from "@app/hooks/api/auditReports";
import { usePopUp } from "@app/hooks/usePopUp";

import { AUDIT_REPORT_TYPE_LABELS, getAuditReportStatusBadge } from "./auditReportMeta";
import { RequestAuditReportModal } from "./RequestAuditReportModal";

const getStatusTooltip = (report: TAuditReport): string | null => {
  if (report.status === AuditReportStatus.Failed) return report.errorMessage;
  if (report.status === AuditReportStatus.Partial) {
    return "Some reports reached the row limit and were truncated.";
  }
  return null;
};

const ReportStatusBadge = ({ report }: { report: TAuditReport }) => {
  const { label, variant } = getAuditReportStatusBadge(report.status);
  const tooltip = getStatusTooltip(report);

  if (!tooltip) return <Badge variant={variant}>{label}</Badge>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant}>{label}</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const AuditReportsCard = () => {
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "requestReport",
    "deleteReport"
  ] as const);

  const canReadReports = permission.can(
    ProjectPermissionInsightsActions.Read,
    ProjectPermissionSub.Insights
  );

  const { offset, limit, page, perPage, setPage, setPerPage } = usePagination("createdAt", {
    initPerPage: 10
  });

  const { data, isPending } = useGetAuditReports(
    { projectId, offset, limit },
    { enabled: canReadReports && Boolean(projectId) }
  );
  const reports = data?.reports ?? [];
  const totalCount = data?.totalCount ?? 0;

  useResetPageHelper({ totalCount, offset, setPage });

  const deleteAuditReport = useDeleteAuditReport();

  const handleDeleteReport = async () => {
    const report = popUp.deleteReport.data as TAuditReport;
    try {
      await deleteAuditReport.mutateAsync(report.id);
      createNotification({ type: "success", text: "Successfully deleted report" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete report";
      createNotification({ type: "error", text: message });
    }
  };

  // Reports read access is part of the Insights read permission; hide the card entirely without it.
  if (!canReadReports) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
        <CardDescription>
          <span>
            Generate compliance reports and have them emailed to your team as CSV attachments
          </span>
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionInsightsActions.GenerateReport}
            a={ProjectPermissionSub.Insights}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                size="xs"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("requestReport")}
              >
                <PlusIcon className="size-3.5" />
                Generate Report
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-[160px] w-full" />}
        {!isPending && totalCount === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No reports yet</EmptyTitle>
              <EmptyDescription>
                Generate a report to have it emailed to your team as a CSV attachment.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && totalCount > 0 && (
          <>
            <Table containerClassName="overflow-x-hidden" className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 w-[30%]">REPORTS</TableHead>
                  <TableHead className="h-10 w-[28%]">RECIPIENTS</TableHead>
                  <TableHead className="h-10 w-[14%]">STATUS</TableHead>
                  <TableHead className="h-10">REQUESTED</TableHead>
                  <TableHead className="h-10 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} className="group/row">
                    <TableCell isTruncatable className="max-w-0">
                      {report.reportConfigs.length <= 1 ? (
                        <span className="block truncate">
                          {report.reportConfigs[0]
                            ? AUDIT_REPORT_TYPE_LABELS[report.reportConfigs[0].type]
                            : ""}
                        </span>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate">
                                {report.reportConfigs
                                  .map((config) => AUDIT_REPORT_TYPE_LABELS[config.type])
                                  .join(", ")}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="flex max-w-sm flex-col gap-0.5">
                              {report.reportConfigs.map((config) => (
                                <span key={config.type}>
                                  {AUDIT_REPORT_TYPE_LABELS[config.type]}
                                </span>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell isTruncatable className="max-w-0">
                      {report.emailRecipients.length <= 1 ? (
                        <span className="block truncate text-muted">
                          {report.emailRecipients[0] ?? ""}
                        </span>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1.5 text-muted">
                                <span className="truncate">{report.emailRecipients[0]}</span>
                                <Badge variant="neutral" className="shrink-0 font-normal">
                                  +{report.emailRecipients.length - 1} more
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="flex max-w-sm flex-col gap-0.5">
                              {report.emailRecipients.map((email) => (
                                <span key={email}>{email}</span>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell>
                      <ReportStatusBadge report={report} />
                    </TableCell>
                    <TableCell>
                      <span className="text-muted">
                        {formatRelative(new Date(report.createdAt), new Date())}
                      </span>
                    </TableCell>
                    <TableCell className="pr-5">
                      <ProjectPermissionCan
                        I={ProjectPermissionInsightsActions.DeleteReport}
                        a={ProjectPermissionSub.Insights}
                      >
                        {(isAllowed) => (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Delete report"
                                  isDisabled={!isAllowed}
                                  className="opacity-0 transition-opacity group-hover/row:opacity-100"
                                  onClick={() => handlePopUpOpen("deleteReport", report)}
                                >
                                  <Trash2Icon className="size-3.5" />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent>Delete report</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </ProjectPermissionCan>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          </>
        )}
      </CardContent>
      <RequestAuditReportModal
        isOpen={popUp.requestReport.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestReport", isOpen)}
        projectId={projectId}
      />
      <AlertDialog
        open={popUp.deleteReport.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteReport", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the report record from the history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDeleteReport}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
