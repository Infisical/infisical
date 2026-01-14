import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionSecretShareAction } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";

import { OrgSecretShareLimitSection } from "./OrgSecretShareLimitSection";
import { SecretSharingAllowShareToAnyone } from "./SecretSharingAllowShareToAnyone";
import { SecretSharingBrandingSection } from "./SecretSharingBrandingSection";

export const SecretSharingSettingsTab = withPermission(
  () => {
    return (
      <div className="w-full">
        <SecretSharingAllowShareToAnyone />
        <OrgSecretShareLimitSection />
        <SecretSharingBrandingSection />
      </div>
    );
  },
  {
    action: OrgPermissionSecretShareAction.ManageSettings,
    subject: OrgPermissionSubjects.SecretShare
  }
);
