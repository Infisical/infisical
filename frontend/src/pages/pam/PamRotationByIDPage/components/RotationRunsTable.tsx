import { Fragment, useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import {
  Badge,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";

import { RotationRun } from "../../PamRotationsPage/mock-data";

type Props = {
  runs: RotationRun[];
};

const STATUS_VARIANT: Record<RotationRun["status"], "success" | "warning" | "danger"> = {
  completed: "success",
  partial: "warning",
  failed: "danger"
};

const COL_COUNT = 6;

export const RotationRunsTable = ({ runs }: Props) => {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  return (
    <div>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-8" />
            <UnstableTableHead>Started</UnstableTableHead>
            <UnstableTableHead>Duration</UnstableTableHead>
            <UnstableTableHead>Triggered By</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Rotated</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {runs.length === 0 && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={COL_COUNT}>
                <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                  <UnstableEmptyHeader>
                    <UnstableEmptyTitle>No rotation runs yet</UnstableEmptyTitle>
                  </UnstableEmptyHeader>
                </UnstableEmpty>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {runs.map((run) => {
            const isExpanded = expandedRunId === run.id;
            const hasErrors = run.accountErrors && run.accountErrors.length > 0;

            return (
              <Fragment key={run.id}>
                <UnstableTableRow
                  className={hasErrors ? "cursor-pointer" : undefined}
                  onClick={
                    hasErrors ? () => setExpandedRunId(isExpanded ? null : run.id) : undefined
                  }
                >
                  <UnstableTableCell>
                    {hasErrors && (
                      <ChevronRightIcon
                        className={`size-4 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    )}
                  </UnstableTableCell>
                  <UnstableTableCell className="text-muted">{run.startedAt}</UnstableTableCell>
                  <UnstableTableCell className="text-muted">{run.duration}</UnstableTableCell>
                  <UnstableTableCell className="text-muted">{run.triggeredBy}</UnstableTableCell>
                  <UnstableTableCell>
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                  </UnstableTableCell>
                  <UnstableTableCell className="text-muted">{run.rotatedCount}</UnstableTableCell>
                </UnstableTableRow>
                {isExpanded && hasErrors && (
                  <UnstableTableRow key={`${run.id}-expanded`}>
                    <UnstableTableCell colSpan={COL_COUNT} className="p-0">
                      <div className="flex flex-col gap-1.5 px-8 py-4">
                        <span className="text-xs font-medium tracking-wider text-label uppercase">
                          Account Errors
                        </span>
                        <div className="flex flex-col gap-1">
                          {run.accountErrors!.map((err) => (
                            <div
                              key={err.accountName}
                              className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs"
                            >
                              <span className="font-semibold text-foreground">
                                {err.accountName}
                              </span>
                              <span className="ml-2 whitespace-pre-wrap text-label">
                                {err.error}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </UnstableTableCell>
                  </UnstableTableRow>
                )}
              </Fragment>
            );
          })}
        </UnstableTableBody>
      </UnstableTable>
    </div>
  );
};
