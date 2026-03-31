import {
  Badge,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePagination,
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

const COL_COUNT = 5;

export const RotationRunsTable = ({ runs }: Props) => {
  return (
    <div>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
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
          {runs.map((run) => (
            <UnstableTableRow key={run.id}>
              <UnstableTableCell className="text-muted">{run.startedAt}</UnstableTableCell>
              <UnstableTableCell className="text-muted">{run.duration}</UnstableTableCell>
              <UnstableTableCell className="text-muted">{run.triggeredBy}</UnstableTableCell>
              <UnstableTableCell>
                <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
              </UnstableTableCell>
              <UnstableTableCell className="text-muted">{run.rotatedCount}</UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
      {runs.length > 0 && (
        <UnstablePagination
          count={runs.length}
          page={1}
          perPage={20}
          onChangePage={() => {}}
          onChangePerPage={() => {}}
        />
      )}
    </div>
  );
};
