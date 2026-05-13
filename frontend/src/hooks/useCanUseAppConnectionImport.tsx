import { useMemo } from "react";
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

type AppConnectionImportArg =
  | { scope: "project-secret"; subject: SecretSubjectArg }
  | { scope: "org-identity" };

export const useCanUseAppConnectionImport = (arg: AppConnectionImportArg) => {
  if (arg.scope === "org-identity") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { permission } = useOrgPermission();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMemo(
      () =>
        permission.can(
          OrgPermissionAppConnectionActions.Connect,
          OrgPermissionSubjects.AppConnections
        ),
      [permission]
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { permission } = useProjectPermission();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMemo(
    () =>
      permission.can(
        ProjectPermissionAppConnectionActions.Connect,
        ProjectPermissionSub.AppConnections
      ) && permission.can(ProjectPermissionSecretActions.Create, arg.subject),
    [permission, arg]
  );
};
