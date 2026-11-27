import { OrgPermissionCan } from "@app/components/permissions";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { AlertAction } from "@app/views/Alerts";

export const GatewayAlertAction = () => (
  <AlertAction
    resourceType={AlertResourceType.Gateway}
    renderPermissionGate={(render) => (
      <OrgPermissionCan
        I={OrgGatewayPermissionActions.EditGateways}
        a={OrgPermissionSubjects.Gateway}
      >
        {render}
      </OrgPermissionCan>
    )}
  />
);
