import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgScimSection } from "./OrgScimSection";
import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    return (
      <div>
        <OrgGeneralAuthSection />
        <OrgSSOSection />
        <OrgScimSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
