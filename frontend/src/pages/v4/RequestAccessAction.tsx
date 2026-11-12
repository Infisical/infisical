import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";

import {
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { useOrgPermission } from "./access/permissions";
import { failed } from "./access/toast";
import { useV4Adapter } from "./data/adapters";

export const RequestAccessAction = ({ projectId }: { projectId: string }) => {
  const { permission } = useOrgPermission();
  const requestAccess = useV4Adapter("projects").useRequestProjectAccess();
  const [requested, setRequested] = useState(false);
  if (!permission.can(OrgPermissionProjectActions.RequestAccess, OrgPermissionSubjects.Project))
    return null;
  return (
    <Button
      variant="outline"
      loading={requestAccess.isPending}
      disabledReason={requested ? "Access requested. An admin will review it." : undefined}
      onClick={async () => {
        try {
          await requestAccess.mutateAsync({ projectId });
          setRequested(true);
        } catch (error) {
          failed("Failed to request project access", error);
        }
      }}
    >
      {requested ? "Access requested" : "Request access"}
    </Button>
  );
};
