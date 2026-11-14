import { useConnectionCreationDialog } from "@app/components/app-connections/useConnectionCreation";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const useOrgConnectionCreation = <TOption,>(
  app: AppConnection | undefined,
  onCreated: (connection: TAppConnection) => void
) => {
  const { permission } = useOrgPermission();
  return useConnectionCreationDialog<TOption>(
    app,
    permission.can(OrgPermissionAppConnectionActions.Create, OrgPermissionSubjects.AppConnections),
    {},
    onCreated
  );
};
