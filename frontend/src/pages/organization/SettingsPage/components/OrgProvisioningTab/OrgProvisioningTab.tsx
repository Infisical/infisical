import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGithubSyncSection } from "./OrgGithubSyncSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { ScimEvents } from "./ScimEvents";

export const OrgProvisioningTab = withPermission(
  () => {
    return (
      <div className="flex flex-col gap-4">
        <OrgGithubSyncSection />
        <OrgScimSection />
        <ScimEvents />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Scim }
);
