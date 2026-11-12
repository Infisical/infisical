import { useEffect, useState } from "react";
import { subject } from "@casl/ability";
import { useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import {
  ProjectPermissionSub,
  useOrgPermission,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { getAwsUpdateStackHint, getAwsUseCaseLabel } from "@app/helpers/awsUseCases";
import {
  appConnectionKeys,
  useGetAppConnectionById,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { EditAppConnectionCredentialsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionCredentialsModal";

type Props = {
  connectionId?: string | null;
  useCases?: string[];
  className?: string;
};

export const AwsUpdateStackHint = ({ connectionId, useCases, className }: Props) => {
  const queryClient = useQueryClient();
  const { currentProject } = useProject();
  const { permission: projectPermission } = useProjectPermission();
  const { permission: orgPermission } = useOrgPermission();
  const [edit, setEdit] = useState<{ isOpen: boolean; useCases: string[] }>({
    isOpen: false,
    useCases: []
  });

  const { data: connections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id,
    { enabled: Boolean(useCases?.length) }
  );
  const connection = connectionId
    ? connections?.find((available) => available.id === connectionId)
    : undefined;

  const {
    data: appConnection,
    errorUpdatedAt,
    isError,
    isFetching
  } = useGetAppConnectionById(AppConnection.AWS, connection?.id ?? "", {
    enabled: edit.isOpen && Boolean(connection)
  });

  useEffect(() => {
    if (!isError) return;
    setEdit((prev) => ({ ...prev, isOpen: false }));
    createNotification({
      text: "Could not load this connection. Try again.",
      type: "error"
    });
  }, [isError, errorUpdatedAt]);

  const handleOpen = (missing: string[]) => {
    if (connection) {
      // A connection cached from an earlier opening would seed the sheet with a stale record.
      queryClient.removeQueries({
        queryKey: appConnectionKeys.byId(AppConnection.AWS, connection.id),
        exact: true
      });
    }
    setEdit({ isOpen: true, useCases: missing });
  };

  // Opening the sheet loads the connection by ID, which needs Read as well as Edit.
  const canEdit = (() => {
    if (!connection) return false;
    if (connection.projectId) {
      const projectSubject = subject(ProjectPermissionSub.AppConnections, {
        connectionId: connection.id
      });
      return (
        projectPermission.can(ProjectPermissionAppConnectionActions.Read, projectSubject) &&
        projectPermission.can(ProjectPermissionAppConnectionActions.Edit, projectSubject)
      );
    }
    const orgSubject = subject(OrgPermissionSubjects.AppConnections, {
      connectionId: connection.id
    });
    return (
      orgPermission.can(OrgPermissionAppConnectionActions.Read, orgSubject) &&
      orgPermission.can(OrgPermissionAppConnectionActions.Edit, orgSubject)
    );
  })();

  const { show, missingUseCases } = getAwsUpdateStackHint({
    recordedUseCases: connection?.provisioning?.useCases,
    neededUseCases: useCases ?? [],
    canEdit
  });

  return (
    <>
      {show && (
        <Alert variant="info" className={className}>
          <InfoIcon />
          <AlertDescription>
            <p>
              Permissions for {missingUseCases.map(getAwsUseCaseLabel).join(", ")} may be missing
              from this connection. Update its stack to add them.
            </p>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                isPending={edit.isOpen && isFetching && !appConnection}
                onClick={() => handleOpen(missingUseCases)}
              >
                Update Stack
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}
      {edit.useCases.length > 0 && appConnection && (
        // The sheet's form submit would otherwise bubble through the React tree into a host form.
        <div className="contents" onSubmit={(event) => event.stopPropagation()}>
          <EditAppConnectionCredentialsModal
            isOpen={edit.isOpen}
            onOpenChange={(isOpen) => setEdit((prev) => ({ ...prev, isOpen }))}
            appConnection={appConnection}
            preselectedUseCases={edit.useCases}
          />
        </div>
      )}
    </>
  );
};
