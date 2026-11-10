import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { useOrgPermission } from "../../../access/permissions";
import { AccessRestricted } from "../../../access/ui";
import { GithubOrgSync } from "./github-sync";
import { ScimGroupRoleMappings } from "./role-mappings";
import { ScimProvisioning } from "./scim";
import { ScimEvents } from "./scim-events";

export const ProvisioningTab = () => {
  const { permission, isPending } = useOrgPermission();
  if (isPending) return <Loader label="Loading provisioning settings" />;
  if (permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Scim)) {
    return <AccessRestricted requirement="read SCIM" />;
  }
  return (
    <Stack gap={24}>
      <GithubOrgSync />
      <ScimProvisioning />
      <ScimGroupRoleMappings />
      <ScimEvents />
    </Stack>
  );
};
