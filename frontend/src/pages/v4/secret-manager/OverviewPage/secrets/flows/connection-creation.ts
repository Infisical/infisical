import {
  type AppConnectionRedirect,
  connectionCreation
} from "@app/components/v4/patterns/app-connection-form";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

import { useProjectPermission } from "../../../../access/permissions";
import { errorMessage } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { CONNECTION_PRESETS } from "../../../../data/integrations/connection-presets";

export type CreatedConnection = { id: string; name: string; app: AppConnection };

export const useConnectionCreation = (
  app: AppConnection,
  projectId: string,
  onCreated: (connection: CreatedConnection) => void,
  redirect?: AppConnectionRedirect
) => {
  const createConnection = useV4Adapter("integrations").useCreateConnection();
  const { permission, isPending } = useProjectPermission(projectId);
  const canCreate =
    isPending ||
    permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    );
  return connectionCreation({
    preset: CONNECTION_PRESETS[app],
    disabledReason: canCreate ? undefined : "No permission to create connections",
    redirect,
    create: async ({ method, name, description, credentials }) => {
      const created = await createConnection
        .mutateAsync({
          app,
          name,
          method: method as TAppConnection["method"],
          credentials: credentials as TAppConnection["credentials"],
          description: (description as string | undefined)?.trim() || null,
          projectId
        } as TCreateAppConnectionDTO)
        .catch((error: unknown) => {
          throw new Error(errorMessage(error));
        });
      onCreated({ id: created.id, name: created.name, app });
      return created;
    }
  });
};
