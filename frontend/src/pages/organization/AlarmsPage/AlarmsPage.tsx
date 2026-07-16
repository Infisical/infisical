import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionIdentityActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { AlarmsPage as AlarmsView } from "@app/views/AlarmsPage";

export const AlarmsPage = withPermission(() => <AlarmsView scope="org" />, {
  action: OrgPermissionIdentityActions.Read,
  subject: OrgPermissionSubjects.Identity
});
