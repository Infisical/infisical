import { DeleteAccountSection } from "../DeleteAccountSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  return (
    <div>
      <UserNameSection />
      <SessionsSection />
      <EmergencyKitSection />
      <DeleteAccountSection />
    </div>
  );
};
