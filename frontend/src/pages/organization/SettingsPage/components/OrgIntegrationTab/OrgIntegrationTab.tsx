import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgIntegrationsSection } from "./OrgIntegrationsSection";

export const OrgIntegrationTab = withPermission(() => <OrgIntegrationsSection />, {
  action: OrgPermissionActions.Read,
  subject: OrgPermissionSubjects.Settings
});
