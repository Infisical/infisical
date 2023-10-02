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
import { useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteSecretImport, useUpdateSecretImport } from "@app/hooks/api";
import { TSecretImports } from "@app/hooks/api/secretImports/types";
import { DecryptedSecret } from "@app/hooks/api/types";

import { SecretImportItem } from "./SecretImportItem";

const SECRET_IN_DASHBOARD = "Present In Dashboard";

type TImportedSecrets = Array<{
  environment: string;
  secretPath: string;
  folderId: string;
  secrets: DecryptedSecret[];
}>;

export const computeImportedSecretRows = (
  importedSecEnv: string,
  importedSecPath: string,
  importSecrets: TImportedSecrets = [],
  secrets: DecryptedSecret[] = [],
  environments: { name: string; slug: string }[] = []
) => {
  const importedSecIndex = importSecrets.findIndex(
    ({ secretPath, environment }) =>
      secretPath === importedSecPath && importedSecEnv === environment
  );
  if (importedSecIndex === -1) return [];

  const importedSec = importSecrets[importedSecIndex];

  const overridenSec: Record<string, { env: string; secretPath: string }> = {};
  const envSlug2Name: Record<string, string> = {};
  environments.forEach((el) => {
    envSlug2Name[el.slug] = el.name;
  });

  for (let i = importedSecIndex + 1; i < importSecrets.length; i += 1) {
    importSecrets[i].secrets.forEach((el) => {
      overridenSec[el.key] = {
        env: envSlug2Name?.[importSecrets[i].environment] || "unknown",
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
  secretImports?: TSecretImports;
  isFetching?: boolean;
  secrets?: DecryptedSecret[];
  importedSecrets?: TImportedSecrets;
  searchTerm: string;
};

type TDeleteSecretImport = { environment: string; secretPath: string };

export const SecretImportListView = ({
  secretImports,
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
  const { currentWorkspace } = useWorkspace();
  const { createNotification } = useNotificationContext();
  const environments = currentWorkspace?.environments || [];
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const [items, setItems] = useState(
    (secretImports?.imports || [])?.map((dto) => ({
      id: `${dto.environment}-${dto.secretPath}`,
      ...dto
    }))
  );

  useEffect(() => {
    if (!isFetching) {
      setItems(
        (secretImports?.imports || [])?.map((dto) => ({
          id: `${dto.environment}-${dto.secretPath}`,
          ...dto
        }))
      );
    }
  }, [isFetching]);

  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();
  const { mutate: updateSecretImport } = useUpdateSecretImport();

  const handleSecretImportDelete = async () => {
    const { environment: importEnv, secretPath: impSecPath } = popUp.deleteSecretImport
      ?.data as TDeleteSecretImport;
    try {
      if (secretImports?._id) {
        await deleteSecretImport({
          workspaceId,
          environment,
          directory: secretPath,
          id: secretImports?._id,
          secretImportEnv: importEnv,
          secretImportPath: impSecPath
        });
        handlePopUpClose("deleteSecretImport");
        createNotification({
          type: "success",
          text: "Successfully removed secret link"
        });
      }
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
        workspaceId,
        environment,
        directory: secretPath,
        id: secretImports?._id || "",
        secretImports: newImportOrder
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
          {items?.map(({ secretPath: importedSecPath, environment: importedEnv }) => (
            <SecretImportItem
              searchTerm={searchTerm}
              key={`${importedEnv}-${importedSecPath}`}
              importedEnv={importedEnv}
              importedSecPath={importedSecPath}
              importedSecrets={computeImportedSecretRows(
                importedEnv,
                importedSecPath,
                importedSecrets,
                secrets,
                environments
              )}
              secretPath={secretPath}
              environment={environment}
              onDelete={(env, secPath) =>
                handlePopUpOpen("deleteSecretImport", { environment: env, secretPath: secPath })
              }
            />
          ))}
        </SortableContext>
      </DndContext>
      <DeleteActionModal
        isOpen={popUp.deleteSecretImport.isOpen}
        deleteKey="unlink"
        title="Do you want to remove this secret import?"
        subTitle={`This will unlink secrets from environment ${
          (popUp.deleteSecretImport?.data as TDeleteSecretImport)?.environment
        } of path ${(popUp.deleteSecretImport?.data as TDeleteSecretImport)?.secretPath}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSecretImport", isOpen)}
        onDeleteApproved={handleSecretImportDelete}
      />
    </>
  );
};
