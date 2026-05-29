import { ForcedSubject } from "@casl/ability";

import { ProjectPermissionSub, useOrgPermission, useProjectPermission } from "@app/context";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretActions,
  SecretSubjectFields
} from "@app/context/ProjectPermissionContext/types";

type SecretSubjectArg =
  | ProjectPermissionSub.Secrets
  | (ForcedSubject<ProjectPermissionSub.Secrets> & SecretSubjectFields);

export const useCanUseProjectAppConnectionImport = (subject: SecretSubjectArg) => {
  const { permission } = useProjectPermission();
  return (
    permission.can(
      ProjectPermissionAppConnectionActions.Connect,
      ProjectPermissionSub.AppConnections
    ) && permission.can(ProjectPermissionSecretActions.Create, subject)
  );
};

export const useCanUseOrgAppConnectionImport = () => {
  const { permission } = useOrgPermission();
  return permission.can(
    OrgPermissionAppConnectionActions.Connect,
    OrgPermissionSubjects.AppConnections
  );
};
