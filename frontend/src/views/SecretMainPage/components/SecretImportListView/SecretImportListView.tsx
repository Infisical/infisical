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

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteSecretImport, useUpdateSecretImport } from "@app/hooks/api";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import { DecryptedSecret, WorkspaceEnv } from "@app/hooks/api/types";

import { SecretImportItem } from "./SecretImportItem";

const SECRET_IN_DASHBOARD = "Present In Dashboard";

type TImportedSecrets = Array<{
  environmentInfo: WorkspaceEnv;
  secretPath: string;
  folderId: string;
  secrets: DecryptedSecret[];
}>;

export const computeImportedSecretRows = (
  importedSecEnv: string,
  importedSecPath: string,
  importSecrets: TImportedSecrets = [],
  secrets: DecryptedSecret[] = []
) => {
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
        secretPath: importSecrets[i].secretPath
      };
    });
  }

  secrets.forEach((el) => {
    overridenSec[el.key] = { env: SECRET_IN_DASHBOARD, secretPath: "" };
  });

  return importedSec.secrets.map(({ key, value }) => ({
    key,
    value,
    overriden: overridenSec?.[key]
  }));
};

type Props = {
  environment: string;
  workspaceId: string;
  secretPath?: string;
  secretImports?: TSecretImport[];
  isFetching?: boolean;
  secrets?: DecryptedSecret[];
  importedSecrets?: TImportedSecrets;
  searchTerm: string;
};

export const SecretImportListView = ({
  secretImports = [],
  environment,
  workspaceId,
  secretPath,
  importedSecrets,
  secrets = [],
  isFetching,
  searchTerm
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSecretImport"
  ] as const);
  const { createNotification } = useNotificationContext();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const [items, setItems] = useState(secretImports);

  useEffect(() => {
    if (!isFetching) {
      setItems(secretImports);
    }
  }, [isFetching]);

  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();
  const { mutate: updateSecretImport } = useUpdateSecretImport();

  const handleSecretImportDelete = async () => {
    const { id: secretImportId } = popUp.deleteSecretImport?.data as { id: string };
    try {
      await deleteSecretImport({
        projectId: workspaceId,
        environment,
        path: secretPath,
        id: secretImportId
      });
      handlePopUpClose("deleteSecretImport");
      createNotification({
        type: "success",
        text: "Successfully removed secret link"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove secret link",
        type: "error"
      });
    }
  };

  const handleSecretImportReorder = ({ over, active }: DragEndEvent) => {
    if (active.id !== over?.id) {
      const oldIndex = items.findIndex(({ id }) => id === active.id);
      const newIndex = items.findIndex(({ id }) => id === over?.id);
      const newImportOrder = arrayMove(items, oldIndex, newIndex);
      setItems(newImportOrder);
      updateSecretImport({
        projectId: workspaceId,
        environment,
        path: secretPath,
        id: active.id as string,
        import: {
          position: newIndex + 1
        }
      });
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
            const { importPath, importEnv, id } = item;
            return (
              <SecretImportItem
                searchTerm={searchTerm}
                key={`imported-env-${id}`}
                id={id}
                importEnvPath={importPath}
                importEnvName={importEnv.name}
                importedSecrets={computeImportedSecretRows(
                  importEnv.slug,
                  importPath,
                  importedSecrets,
                  secrets
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
