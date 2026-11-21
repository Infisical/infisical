import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { FolderAccessSection, PrivilegesMovedNotice } from "./folder-access";
import { AdditionalPrivilegesSection } from "./privileges";
import { STANDALONE_PRODUCTS } from "./product";

type Target =
  | { type: "user"; membershipId: string; userId: string; email: string; name: string }
  | { type: "identity"; identityId: string; name: string };

export const ProjectAccessExtras = ({
  projectId,
  projectType,
  target,
  readOnly = false
}: {
  projectId: string;
  projectType: ProjectType;
  target: Target;
  readOnly?: boolean;
}) => {
  const { organization } = useV4Session();
  const project = useV4Adapter("access").useProject(projectId).data;
  const hasFolderRbacPlan = Boolean(
    useV4Adapter("secrets").useOverviewPlan(organization.id).data?.secretsFolderRbac
  );
  const isSecretManager = projectType === ProjectType.SecretManager;
  const isLegacyPrivileges = Boolean(project?.isLegacyAdditionalPrivilegesEnabled);
  const privilegesHidden =
    target.type === "user"
      ? projectType === ProjectType.CertificateManager
      : STANDALONE_PRODUCTS.includes(projectType);
  const actor =
    target.type === "user"
      ? { type: "user" as const, id: target.userId, name: target.name }
      : { type: "identity" as const, id: target.identityId, name: target.name };

  return (
    <>
      {!privilegesHidden && isLegacyPrivileges && (
        <AdditionalPrivilegesSection projectId={projectId} target={target} readOnly={readOnly} />
      )}
      {isSecretManager && !hasFolderRbacPlan && !isLegacyPrivileges && <PrivilegesMovedNotice />}
      {isSecretManager && (
        <FolderAccessSection projectId={projectId} actor={actor} readOnly={readOnly} />
      )}
    </>
  );
};
