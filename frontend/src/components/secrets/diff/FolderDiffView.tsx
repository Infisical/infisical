import { useRef } from "react";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

import { MultiLineTextDiffRenderer, SingleLineTextDiffRenderer } from "./FieldDiffRenderers";

export interface FolderVersionData {
  name?: string;
  description?: string;
}

export interface FolderDiffViewProps {
  operationType: "create" | "update" | "delete";
  oldVersion?: FolderVersionData;
  newVersion?: FolderVersionData;
}

export const FolderDiffView = ({ operationType, oldVersion, newVersion }: FolderDiffViewProps) => {
  const oldDescriptionDiffContainerRef = useRef<HTMLDivElement>(null);
  const newDescriptionDiffContainerRef = useRef<HTMLDivElement>(null);

  const oldName = oldVersion?.name ?? "";
  const newName = newVersion?.name ?? "";
  const hasNameChanges = oldName !== newName && oldName !== "" && newName !== "";

  const oldDescription = oldVersion?.description ?? "";
  const newDescription = newVersion?.description ?? "";
  const hasDescriptionChanges = oldDescription !== newDescription;

  const showOldVersion = operationType === "update" || operationType === "delete";
  const showNewVersion = operationType === "update" || operationType === "create";

  return (
    <div className="flex flex-col space-y-4 space-x-0 xl:flex-row xl:space-y-0 xl:space-x-4">
      {showOldVersion ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-danger/35 bg-danger/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">Previous Folder</span>
            <Badge variant="danger">
              <CircleXIcon /> Previous
            </Badge>
          </div>
          <div className="mb-2">
            <div className="mb-0.5 text-xs font-medium text-label">Name</div>
            <SingleLineTextDiffRenderer
              text={oldName}
              oldText={oldName}
              newText={newName}
              hasChanges={hasNameChanges}
              isOldVersion
            />
          </div>
          <div className="mb-2">
            <div className="mb-0.5 text-xs font-medium text-label">Description</div>
            <MultiLineTextDiffRenderer
              text={oldDescription}
              oldText={oldDescription}
              newText={newDescription}
              hasChanges={hasDescriptionChanges}
              isOldVersion
              containerRef={oldDescriptionDiffContainerRef}
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full cursor-default flex-col items-center justify-center rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 xl:w-1/2">
          <span className="text-sm text-mineshaft-400">
            Folder did not exist in the previous version.
          </span>
        </div>
      )}

      {showNewVersion ? (
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-success/35 bg-success/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">New Folder</span>
            <Badge variant="success">
              <CircleCheckIcon /> New
            </Badge>
          </div>
          <div className="mb-2">
            <div className="mb-0.5 text-xs font-medium text-label">Name</div>
            <SingleLineTextDiffRenderer
              text={newName}
              oldText={oldName}
              newText={newName}
              hasChanges={hasNameChanges}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="mb-0.5 text-xs font-medium text-label">Description</div>
            <MultiLineTextDiffRenderer
              text={newDescription}
              oldText={oldDescription}
              newText={newDescription}
              hasChanges={hasDescriptionChanges}
              isOldVersion={false}
              containerRef={newDescriptionDiffContainerRef}
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full cursor-default flex-col items-center justify-center rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 xl:w-1/2">
          <span className="text-sm text-mineshaft-400">Folder will be deleted.</span>
        </div>
      )}
    </div>
  );
};
