import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteSecretImport, useUpdateSecretImport } from "@app/hooks/api";
import { ReservedFolders } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import { ProjectEnv, SecretV3RawSanitized } from "@app/hooks/api/types";
import { formatReservedPaths } from "@app/lib/fn/string";

import { SecretImportItem } from "./SecretImportItem";

const SECRET_IN_DASHBOARD = "Present In Dashboard";

type TImportedSecrets = Array<{
  environmentInfo: ProjectEnv;
  secretPath: string;
  folderId: string;
  secrets: SecretV3RawSanitized[];
}>;

export const computeImportedSecretRows = (
  secretImport: TSecretImport,
  importSecrets: TImportedSecrets = [],
  secrets: SecretV3RawSanitized[] = [],
  replicatedFolder?: TSecretImport
) => {
  const importedSecEnv = replicatedFolder?.importEnv.slug ?? secretImport.importEnv.slug;
  const importedSecPath = replicatedFolder?.importPath ?? secretImport.importPath;
  const overrideEnv = secretImport.isReserved ? secretImport.importEnv.slug : undefined;
  const overridePath = secretImport.isReserved ? secretImport.importPath : undefined;
  const importedSecIndex = importSecrets.findIndex(
    ({ secretPath, environmentInfo }) =>
      secretPath === importedSecPath && importedSecEnv === environmentInfo.slug
  );
  if (importedSecIndex === -1) return [];

  const importedSec = importSecrets[importedSecIndex];
  const overridenSec: Record<string, { env: string; secretPath: string }> = {};

  for (let i = importedSecIndex + 1; i < importSecrets.length; i += 1) {
    importSecrets[i].secrets.forEach((el) => {
      overridenSec[el.key] = {
        env: importSecrets[i].environmentInfo.name,
        secretPath: formatReservedPaths(importSecrets[i].secretPath)
      };
    });
  }

  secrets.forEach((el) => {
    overridenSec[el.key] = { env: SECRET_IN_DASHBOARD, secretPath: "" };
  });

  const importedEntry: Record<string, boolean> = {};
  const importedSecretEntries: {
    key: string;
    value?: string;
    environment: string;
    secretPath?: string;
    overridden: {
      env: string;
      secretPath: string;
    };
    isEmpty?: boolean;
  }[] = [];

  importedSec.secrets.forEach(({ key, value, isEmpty }) => {
    if (!importedEntry[key]) {
      importedSecretEntries.push({
        key,
        value,
        environment: overrideEnv ?? importedSec.environmentInfo.slug,
        secretPath: overridePath ?? importedSec.secretPath,
        overridden: overridenSec?.[key],
        isEmpty
      });
      importedEntry[key] = true;
    }
  });

  return importedSecretEntries;
};

type Props = {
  environment: string;
  projectId: string;
  secretPath?: string;
  secretImports?: TSecretImport[];
  isFetching?: boolean;
  // secrets?: SecretV3RawSanitized[];
  importedSecrets?: TImportedSecrets;
  searchTerm: string;
};

export const SecretImportListView = ({
  secretImports,
  environment,
  projectId,
  secretPath,
  importedSecrets,
  // secrets = [],
  isFetching,
  searchTerm
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSecretImport"
  ] as const);

  const [replicationSecrets, setReplicationSecrets] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const [items, setItems] = useState(secretImports ?? []);

  const getImportReplicatedFolder = (importPath: string) => {
    if (!importPath.includes("/__reserve_replication_")) return undefined;
    const cleanImportPath = importPath.split("/__reserve_replication_")[1];
    const replicatedFolder = items?.find(({ id }) => id === cleanImportPath);
    return replicatedFolder;
  };

  useEffect(() => {
    if (!isFetching) {
      setItems(secretImports ?? []);
    }
  }, [isFetching, secretImports]);

  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();
  const { mutate: updateSecretImport } = useUpdateSecretImport();

  const handleSecretImportDelete = async () => {
    const { id: secretImportId } = popUp.deleteSecretImport?.data as { id: string };
    await deleteSecretImport({
      projectId,
      environment,
      path: secretPath,
      id: secretImportId
    });
    handlePopUpClose("deleteSecretImport");
    createNotification({
      type: "success",
      text: "Successfully removed secret link"
    });
  };

  const handleSecretImportReorder = ({ over, active }: DragEndEvent) => {
    if (active.id !== over?.id) {
      const oldIndex = items.findIndex(({ id }) => id === active.id);
      const newIndex = items.findIndex(({ id }) => id === over?.id);
      const newImportOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newImportOrder);
      updateSecretImport({
        projectId,
        environment,
        path: secretPath,
        id: active.id as string,
        import: {
          position: newIndex + 1
        }
      });
    }
  };

  const handleOpenReplicationSecrets = (replicationImportId: string) => {
    const reservedImport = secretImports?.find(
      ({ isReserved, importPath, importEnv }) =>
        importEnv.slug === environment &&
        isReserved &&
        importPath ===
          `${secretPath === "/" ? "" : secretPath}/${
            ReservedFolders.SecretReplication
          }${replicationImportId}`
    );
    if (reservedImport) {
      setReplicationSecrets((state) => ({
        ...state,
        [reservedImport.id]: !state?.[reservedImport.id]
      }));
    }
  };

  return (
    <>
      <DndContext
        onDragEnd={handleSecretImportReorder}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items?.map((item) => {
            // TODO(akhilmhdh): change this and pass this whole object instead of one by one
            const replicatedFolder = item.isReserved
              ? getImportReplicatedFolder(item.importPath)
              : undefined;
            return (
              <SecretImportItem
                searchTerm={searchTerm}
                key={`imported-env-${item.id}`}
                isReplicationExpand={replicationSecrets?.[item.id]}
                onExpandReplicateSecrets={handleOpenReplicationSecrets}
                secretImport={item}
                importedSecrets={computeImportedSecretRows(
                  item,
                  importedSecrets,
                  [],
                  // secrets scott - now that secrets are paginated we are not showing if they are overridden (yet?)
                  replicatedFolder
                )}
                secretPath={secretPath}
                environment={environment}
                onDelete={() => handlePopUpOpen("deleteSecretImport", item)}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      <DeleteActionModal
        isOpen={popUp.deleteSecretImport.isOpen}
        deleteKey="unlink"
        title="Do you want to remove this secret import?"
        subTitle={`This will unlink secrets from environment ${
          (popUp.deleteSecretImport?.data as TSecretImport)?.importEnv
        } of path ${(popUp.deleteSecretImport?.data as TSecretImport)?.importPath}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSecretImport", isOpen)}
        onDeleteApproved={handleSecretImportDelete}
      />
    </>
  );
};
