import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGithubSyncSection } from "./OrgGithubSyncSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { ScimEvents } from "./ScimEvents";

export const OrgProvisioningTab = withPermission(
  () => {
    return (
      <>
        <OrgScimSection />
        <OrgGithubSyncSection />
        <ScimEvents />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
