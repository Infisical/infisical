import {
  FOLDER_FIELD_ORDER,
  FOLDER_IDENTITY_FIELD,
  getFolderFieldChanges,
  getFolderPopulatedFields,
  getSecretFieldChanges,
  getSecretPopulatedFields,
  ResourceOperationType,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD,
  summarizeCompactFields
} from "./fieldChanges";
import { FolderDiffView } from "./FolderDiffView";
import { SecretDiffView } from "./SecretDiffView";
import { FolderVersionData, SecretVersionData } from "./types";

export interface CompactSecretDiffViewProps {
  operationType: ResourceOperationType;
  oldVersion?: SecretVersionData;
  newVersion?: SecretVersionData;
  onRevealOldValue?: () => Promise<void>;
  onRevealNewValue?: () => Promise<void>;
  isLoadingOldValue?: boolean;
  isLoadingNewValue?: boolean;
  resourceLabel?: string;
}

export const CompactSecretDiffView = ({
  operationType,
  oldVersion,
  newVersion,
  onRevealOldValue,
  onRevealNewValue,
  isLoadingOldValue,
  isLoadingNewValue,
  resourceLabel
}: CompactSecretDiffViewProps) => {
  const { visibleKeys } = summarizeCompactFields({
    operationType,
    fieldOrder: SECRET_FIELD_ORDER,
    identityField: SECRET_IDENTITY_FIELD,
    changes: getSecretFieldChanges(oldVersion, newVersion),
    populated: getSecretPopulatedFields(operationType === "delete" ? oldVersion : newVersion)
  });

  return (
    <SecretDiffView
      operationType={operationType}
      oldVersion={oldVersion}
      newVersion={newVersion}
      onRevealOldValue={onRevealOldValue}
      onRevealNewValue={onRevealNewValue}
      isLoadingOldValue={isLoadingOldValue}
      isLoadingNewValue={isLoadingNewValue}
      resourceLabel={resourceLabel}
      visibleFields={visibleKeys}
    />
  );
};

export interface CompactFolderDiffViewProps {
  operationType: ResourceOperationType;
  oldVersion?: FolderVersionData;
  newVersion?: FolderVersionData;
  resourceLabel?: string;
}

export const CompactFolderDiffView = ({
  operationType,
  oldVersion,
  newVersion,
  resourceLabel
}: CompactFolderDiffViewProps) => {
  const { visibleKeys } = summarizeCompactFields({
    operationType,
    fieldOrder: FOLDER_FIELD_ORDER,
    identityField: FOLDER_IDENTITY_FIELD,
    changes: getFolderFieldChanges(oldVersion, newVersion),
    populated: getFolderPopulatedFields(operationType === "delete" ? oldVersion : newVersion)
  });

  return (
    <FolderDiffView
      operationType={operationType}
      oldVersion={oldVersion}
      newVersion={newVersion}
      resourceLabel={resourceLabel}
      visibleFields={visibleKeys}
    />
  );
};
