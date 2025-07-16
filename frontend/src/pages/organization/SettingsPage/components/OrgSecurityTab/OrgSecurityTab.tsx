import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGenericAuthSection } from "./OrgGenericAuthSection";
import { OrgUserAccessTokenLimitSection } from "./OrgUserAccessTokenLimitSection";

export const OrgSecurityTab = withPermission(
  () => {
    return (
      <>
        <OrgGenericAuthSection />
        <OrgUserAccessTokenLimitSection />
      </>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
