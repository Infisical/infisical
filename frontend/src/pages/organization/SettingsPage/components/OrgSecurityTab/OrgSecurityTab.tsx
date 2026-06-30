import { OrgPermissionSsoActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGenericAuthSection } from "./OrgGenericAuthSection";
import { OrgUserAccessTokenLimitSection } from "./OrgUserAccessTokenLimitSection";

export const OrgSecurityTab = withPermission(
  () => {
    return (
      <div className="flex flex-col gap-4">
        <OrgGenericAuthSection />
        <OrgUserAccessTokenLimitSection />
      </div>
    );
  },
  { action: OrgPermissionSsoActions.Read, subject: OrgPermissionSubjects.Sso }
);
