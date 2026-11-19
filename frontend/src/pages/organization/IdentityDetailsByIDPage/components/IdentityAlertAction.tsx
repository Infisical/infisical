import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { AlertAction } from "@app/views/Alerts";

type Props = {
  identityId: string;
};

export const IdentityAlertAction = ({ identityId }: Props) => (
  <AlertAction
    resourceType={AlertResourceType.IdentityAuthentication}
    resourceId={identityId}
    renderPermissionGate={(render) => (
      <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
        {render}
      </OrgPermissionCan>
    )}
  />
);
