import { OrgPermissionCan } from "@app/components/permissions";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { AlertAction } from "@app/views/Alerts";

export const AuditLogStreamAlertAction = () => (
  <AlertAction
    resourceType={AlertResourceType.AuditLogStream}
    renderPermissionGate={(render) => (
      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
        {render}
      </OrgPermissionCan>
    )}
  />
);
