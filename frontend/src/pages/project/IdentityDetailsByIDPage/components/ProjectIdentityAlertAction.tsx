import { subject } from "@casl/ability";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/context";
import { AlertAction } from "@app/views/Alerts";

type Props = {
  identityId: string;
  projectId?: string;
  readOnly?: boolean;
};

export const ProjectIdentityAlertAction = ({ identityId, projectId, readOnly = false }: Props) => (
  <AlertAction
    identityId={identityId}
    projectId={projectId}
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
