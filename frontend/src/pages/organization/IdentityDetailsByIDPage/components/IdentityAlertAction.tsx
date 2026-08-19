import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { AlertAction } from "@app/views/Alerts";

type Props = {
  identityId: string;
  identityName: string;
};

export const IdentityAlertAction = ({ identityId, identityName }: Props) => (
  <AlertAction
    identityId={identityId}
    identityName={identityName}
    renderPermissionGate={(render) => (
      <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
        {render}
      </OrgPermissionCan>
    )}
  />
);
