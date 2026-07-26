import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { AlertDetail } from "@app/views/Alerts";

type Props = {
  identityId: string;
  identityName: string;
};

export const IdentityAlertDetail = ({ identityId, identityName }: Props) => (
  <AlertDetail
    identityId={identityId}
    identityName={identityName}
    renderPermissionGate={(render) => (
      <OrgPermissionCan
        I={OrgPermissionIdentityActions.Edit}
        a={OrgPermissionSubjects.Identity}
      >
        {render}
      </OrgPermissionCan>
    )}
  />
);
