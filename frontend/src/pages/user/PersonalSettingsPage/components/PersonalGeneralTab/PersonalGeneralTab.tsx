import { useUser } from "@app/context";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";

import { DeleteAccountSection } from "../DeleteAccountSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  const { user } = useUser();
  const encryptionVersion = user?.encryptionVersion ?? UserEncryptionVersion.V2;

  return (
    <div>
      <UserNameSection />
      <SessionsSection />
      {encryptionVersion === UserEncryptionVersion.V1 && <EmergencyKitSection />}
      <DeleteAccountSection />
    </div>
  );
};
