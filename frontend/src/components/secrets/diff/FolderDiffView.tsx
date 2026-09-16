import { useRef } from "react";

import { DiffPaneField, DiffPanes } from "./DiffPanes";
import {
  FOLDER_FIELD_LABELS,
  FOLDER_FIELD_ORDER,
  FolderFieldKey,
  getFolderFieldChanges
} from "./fieldChanges";
import { MultiLineTextDiffRenderer, SingleLineTextDiffRenderer } from "./FieldDiffRenderers";
import { FolderVersionData } from "./types";

export interface FolderDiffViewProps {
  operationType: "create" | "update" | "delete";
  oldVersion?: FolderVersionData;
  newVersion?: FolderVersionData;
  /** Completes the "Previous …" / "New …" pane titles. */
  resourceLabel?: string;
  /** Flags each changed property, for when the panes show unchanged properties too. */
  showChangedMarkers?: boolean;
  /** Narrows the panes to these properties, in display order. Defaults to every property. */
  visibleFields?: FolderFieldKey[];
}

export const FolderDiffView = ({
  operationType,
  oldVersion,
  newVersion,
  resourceLabel = "Folder",
  showChangedMarkers,
  visibleFields = FOLDER_FIELD_ORDER
}: FolderDiffViewProps) => {
  const oldDescriptionDiffContainerRef = useRef<HTMLDivElement>(null);
  const newDescriptionDiffContainerRef = useRef<HTMLDivElement>(null);

  const changes = getFolderFieldChanges(oldVersion, newVersion);

  const oldName = oldVersion?.name ?? "";
  const newName = newVersion?.name ?? "";

  const oldDescription = oldVersion?.description ?? "";
  const newDescription = newVersion?.description ?? "";

  const fieldByKey: Record<FolderFieldKey, DiffPaneField> = {
    name: {
      key: "name",
      label: FOLDER_FIELD_LABELS.name,
      hasChanges: changes.name,
      previous: (
        <SingleLineTextDiffRenderer
          text={oldName}
          oldText={oldName}
          newText={newName}
          hasChanges={changes.name}
          isOldVersion
        />
      ),
      next: (
        <SingleLineTextDiffRenderer
          text={newName}
          oldText={oldName}
          newText={newName}
          hasChanges={changes.name}
          isOldVersion={false}
        />
      )
    },
    description: {
      key: "description",
      label: FOLDER_FIELD_LABELS.description,
      hasChanges: changes.description,
      previous: (
        <MultiLineTextDiffRenderer
          text={oldDescription}
          oldText={oldDescription}
          newText={newDescription}
          hasChanges={changes.description}
          isOldVersion
          containerRef={oldDescriptionDiffContainerRef}
        />
      ),
      next: (
        <MultiLineTextDiffRenderer
          text={newDescription}
          oldText={oldDescription}
          newText={newDescription}
          hasChanges={changes.description}
          isOldVersion={false}
          containerRef={newDescriptionDiffContainerRef}
        />
      )
    }
  };

  return (
    <DiffPanes
      operationType={operationType}
      fields={visibleFields.map((field) => fieldByKey[field])}
      resourceLabel={resourceLabel}
      showChangedMarkers={showChangedMarkers}
      previousEmptyMessage="Folder did not exist in the previous version."
      nextEmptyMessage="Folder will be deleted."
    />
  );
};
