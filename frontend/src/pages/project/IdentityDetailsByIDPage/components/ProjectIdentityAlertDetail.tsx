import { subject } from "@casl/ability";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { AlertDetail } from "@app/views/Alerts";

type Props = {
  identityId: string;
  identityName: string;
  projectId?: string;
  projectName?: string;
  readOnly?: boolean;
};

export const ProjectIdentityAlertDetail = ({
  identityId,
  identityName,
  projectId,
  projectName,
  readOnly = false
}: Props) => (
  <AlertDetail
    identityId={identityId}
    identityName={identityName}
    projectId={projectId}
    scopeName={projectName}
    readOnly={readOnly}
    renderPermissionGate={(render) => (
      <ProjectPermissionCan
        I={ProjectPermissionIdentityActions.Edit}
        a={subject(ProjectPermissionSub.Identity, { identityId })}
      >
        {render}
      </ProjectPermissionCan>
    )}
  />
);
