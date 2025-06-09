import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGithubSyncSection } from "./OrgGithubSyncSection";
import { OrgScimSection } from "./OrgSCIMSection";

export const OrgProvisioningTab = withPermission(
  () => {
    return (
      <>
        <OrgScimSection />
        <OrgGithubSyncSection />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
