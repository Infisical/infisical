import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgAppsSection } from "./OrgAppsSection";
import { OrgWorkflowIntegrationSection } from "./OrgWorkflowIntegrationSection";

export const OrgIntegrationTab = withPermission(
  () => (
    <>
      <OrgWorkflowIntegrationSection />
      <OrgAppsSection />
    </>
  ),
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
