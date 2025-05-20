import { OrgSecretShareLimitSection } from "../OrgSecretShareLimitSection";
import { SecretSharingAllowShareToAnyone } from "../SecretSharingAllowShareToAnyone";

export const SecretSharingSettingsGeneralTab = () => {
  return (
    <div className="w-full">
      <SecretSharingAllowShareToAnyone />
      <OrgSecretShareLimitSection />
    </div>
  );
};
