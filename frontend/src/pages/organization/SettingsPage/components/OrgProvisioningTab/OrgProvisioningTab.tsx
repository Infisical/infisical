import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGithubSyncSection } from "./OrgGithubSyncSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { ScimEvents } from "./ScimEvents";

export const OrgProvisioningTab = withPermission(
  () => {
    const { isSubOrganization } = useOrganization();
    return (
      <>
        <OrgScimSection />
        {!isSubOrganization && <OrgGithubSyncSection />}
        <ScimEvents />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Scim }
);
