import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { AlertAction } from "@app/views/Alerts";

type Props = {
  identityId: string;
};

export const IdentityAlertAction = ({ identityId }: Props) => (
  <AlertAction
    identityId={identityId}
    renderPermissionGate={(render) => (
      <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
        {render}
      </OrgPermissionCan>
    )}
  />
);
