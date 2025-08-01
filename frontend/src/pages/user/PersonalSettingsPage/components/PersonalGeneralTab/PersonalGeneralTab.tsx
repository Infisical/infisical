import { DeleteAccountSection } from "../DeleteAccountSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  return (
    <div>
      <UserNameSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
};
