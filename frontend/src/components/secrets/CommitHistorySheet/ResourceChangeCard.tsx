import { FolderIcon, KeyIcon, MaximizeIcon, MinimizeIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  CompactFolderDiffView,
  CompactSecretDiffView,
  FOLDER_FIELD_LABELS,
  FOLDER_FIELD_ORDER,
  FOLDER_IDENTITY_FIELD,
  FolderDiffView,
  FolderVersionData,
  getFolderFieldChanges,
  getFolderPopulatedFields,
  getSecretFieldChanges,
  getSecretPopulatedFields,
  SECRET_FIELD_LABELS,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD,
  SecretDiffView,
  SecretVersionData,
  summarizeCompactFields
} from "@app/components/secrets/diff";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button
} from "@app/components/v3";

export type ResourceChange = {
  id: string;
  type: "secret" | "folder";
  operationType: "create" | "update" | "delete";
  name: string;
  oldSecret?: SecretVersionData;
  newSecret?: SecretVersionData;
  oldFolder?: FolderVersionData;
  newFolder?: FolderVersionData;
};

const OPERATION_BADGE = {
  create: { label: "Added", variant: "success" as const },
  update: { label: "Updated", variant: "warning" as const },
  delete: { label: "Deleted", variant: "danger" as const }
};

const getFieldSummary = (change: ResourceChange) => {
  if (change.type === "secret") {
    const summary = summarizeCompactFields({
      operationType: change.operationType,
      fieldOrder: SECRET_FIELD_ORDER,
      identityField: SECRET_IDENTITY_FIELD,
      changes: getSecretFieldChanges(change.oldSecret, change.newSecret),
      populated: getSecretPopulatedFields(
        change.operationType === "delete" ? change.oldSecret : change.newSecret
      )
    });
    return {
      ...summary,
      identityLabel: SECRET_FIELD_LABELS[SECRET_IDENTITY_FIELD],
      singleChangedLabel: SECRET_FIELD_LABELS[summary.changedKeys[0]]
    };
  }

  const summary = summarizeCompactFields({
    operationType: change.operationType,
    fieldOrder: FOLDER_FIELD_ORDER,
    identityField: FOLDER_IDENTITY_FIELD,
    changes: getFolderFieldChanges(change.oldFolder, change.newFolder),
    populated: getFolderPopulatedFields(
      change.operationType === "delete" ? change.oldFolder : change.newFolder
    )
  });
  return {
    ...summary,
    identityLabel: FOLDER_FIELD_LABELS[FOLDER_IDENTITY_FIELD],
    singleChangedLabel: FOLDER_FIELD_LABELS[summary.changedKeys[0]]
  };
};

type Props = {
  change: ResourceChange;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isFullState: boolean;
  onToggleFullState: () => void;
};

export const ResourceChangeCard = ({
  change,
  isCollapsed,
  onToggleCollapse,
  isFullState,
  onToggleFullState
}: Props) => {
  const { changedCount, identityLabel, singleChangedLabel } = getFieldSummary(change);
  const badge = OPERATION_BADGE[change.operationType];
  const TypeIcon = change.type === "secret" ? KeyIcon : FolderIcon;

  const isUpdate = change.operationType === "update";

  let changedLabel: string | null = null;
  if (isUpdate) {
    if (changedCount === 1) changedLabel = `${singleChangedLabel.toLowerCase()} changed`;
    else changedLabel = `${changedCount} fields changed`;
  }

  let compactToggleLabel = `Show ${identityLabel.toLowerCase()} only`;
  if (isUpdate) compactToggleLabel = "Show changed properties only";
  else if (change.operationType === "create") compactToggleLabel = "Show set properties only";

  const diffView = (() => {
    if (change.type === "secret") {
      return isFullState ? (
        <SecretDiffView
          operationType={change.operationType}
          oldVersion={change.oldSecret}
          newVersion={change.newSecret}
          resourceLabel="state"
          // Every property of a create or delete is trivially "changed", so the marker
          // only carries information on an update
          showChangedMarkers={isUpdate}
        />
      ) : (
        <CompactSecretDiffView
          operationType={change.operationType}
          oldVersion={change.oldSecret}
          newVersion={change.newSecret}
          resourceLabel="state"
        />
      );
    }

    return isFullState ? (
      <FolderDiffView
        operationType={change.operationType}
        oldVersion={change.oldFolder}
        newVersion={change.newFolder}
        resourceLabel="state"
        showChangedMarkers={isUpdate}
      />
    ) : (
      <CompactFolderDiffView
        operationType={change.operationType}
        oldVersion={change.oldFolder}
        newVersion={change.newFolder}
        resourceLabel="state"
      />
    );
  })();

  return (
    <Accordion
      type="single"
      value={isCollapsed ? "" : change.id}
      onValueChange={onToggleCollapse}
      collapsible
    >
      <AccordionItem value={change.id}>
        <AccordionTrigger className="min-h-10 overflow-hidden py-0">
          <TypeIcon
            className={twMerge(
              "size-4 shrink-0",
              change.type === "secret" ? "text-secret" : "text-folder"
            )}
          />
          <span
            className={twMerge(
              "flex-1 truncate text-left font-mono",
              change.operationType === "delete" && "text-danger/85 line-through"
            )}
          >
            {change.name}
          </span>
          {changedLabel && <span className="shrink-0 text-xs text-accent">{changedLabel}</span>}
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </AccordionTrigger>
        <AccordionContent className="p-3">
          {diffView}
          <div className="mt-2">
            <Button variant="ghost" size="xs" className="-ml-2" onClick={onToggleFullState}>
              {isFullState ? <MinimizeIcon /> : <MaximizeIcon />}
              {isFullState ? compactToggleLabel : "Show full state"}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
