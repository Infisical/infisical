import { DeleteAccountSection } from "../DeleteAccountSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  return (
    <div className="space-y-6">
      <UserNameSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
};
