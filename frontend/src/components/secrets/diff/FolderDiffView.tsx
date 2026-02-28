import { useRef } from "react";
import { faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">Previous Folder</span>
            <div className="rounded-full bg-red px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
              Previous
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Name</div>
            <SingleLineTextDiffRenderer
              text={oldName}
              oldText={oldName}
              newText={newName}
              hasChanges={hasNameChanges}
              isOldVersion
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Description</div>
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
        <div className="flex w-full min-w-0 cursor-default flex-col rounded-lg border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
          <div className="mb-4 flex flex-row justify-between">
            <span className="text-md font-medium">New Folder</span>
            <div className="rounded-full bg-green-600 px-2 pt-[0.2rem] pb-[0.14rem] text-xs font-medium">
              <FontAwesomeIcon icon={faCircleCheck} className="pr-1 text-white" />
              New
            </div>
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Name</div>
            <SingleLineTextDiffRenderer
              text={newName}
              oldText={oldName}
              newText={newName}
              hasChanges={hasNameChanges}
              isOldVersion={false}
            />
          </div>
          <div className="mb-2">
            <div className="text-sm font-medium text-mineshaft-300">Description</div>
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
