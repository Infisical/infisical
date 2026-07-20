import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { AlertsPage as AlertsView } from "@app/views/AlertsPage";

export const AlertsPage = withPermission(() => <AlertsView scope="org" />, {
  action: OrgPermissionIdentityActions.Read,
  subject: OrgPermissionSubjects.Identity
});
