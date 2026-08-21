import { ReactNode } from "react";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

import { ResourceOperationType } from "./fieldChanges";
import { DiffFieldLabel } from "./FieldDiffRenderers";

export type DiffPaneField = {
  key: string;
  label: string;
  hasChanges: boolean;
  previous: ReactNode;
  next: ReactNode;
};

export interface DiffPanesProps {
  operationType: ResourceOperationType;
  /** The properties to render, in display order. */
  fields: DiffPaneField[];
  /** Completes the "Previous …" / "New …" pane titles. */
  resourceLabel: string;
  /** Flags each changed property, for when the panes show unchanged properties too. */
  showChangedMarkers?: boolean;
  previousEmptyMessage: string;
  nextEmptyMessage: string;
  /** Sits beside the "New" badge, for state the new version alone can carry. */
  newPaneBadge?: ReactNode;
}

const EmptyPane = ({ message }: { message: string }) => (
  <div className="flex w-full cursor-default flex-col items-center justify-center rounded-lg border border-dashed border-border bg-container p-4 text-center shadow-inner xl:w-1/2">
    <span className="text-sm text-muted">{message}</span>
  </div>
);

export const DiffPanes = ({
  operationType,
  fields,
  resourceLabel,
  showChangedMarkers,
  previousEmptyMessage,
  nextEmptyMessage,
  newPaneBadge
}: DiffPanesProps) => {
  const showPrevious = operationType === "update" || operationType === "delete";
  const showNext = operationType === "update" || operationType === "create";

  const renderFields = (side: "previous" | "next") => {
    if (!fields.length) {
      return <span className="text-sm text-muted">No property changes.</span>;
    }

    return fields.map((field) => (
      <div key={field.key} className="mb-2.5 last:mb-0">
        <DiffFieldLabel
          label={field.label}
          hasChanges={field.hasChanges}
          showChangedMarker={showChangedMarkers}
        />
        {field[side]}
      </div>
    ));
  };

  return (
    <div className="flex flex-col space-y-4 space-x-0 xl:flex-row xl:space-y-0 xl:space-x-4">
      {showPrevious ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-danger/35 bg-danger/5 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">Previous {resourceLabel}</span>
            <Badge variant="danger">
              <CircleXIcon /> Previous
            </Badge>
          </div>
          {renderFields("previous")}
        </div>
      ) : (
        <EmptyPane message={previousEmptyMessage} />
      )}

      {showNext ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-success/35 bg-success/5 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">New {resourceLabel}</span>
            <div className="flex items-center gap-2">
              {newPaneBadge}
              <Badge variant="success">
                <CircleCheckIcon /> New
              </Badge>
            </div>
          </div>
          {renderFields("next")}
        </div>
      ) : (
        <EmptyPane message={nextEmptyMessage} />
      )}
    </div>
  );
};
