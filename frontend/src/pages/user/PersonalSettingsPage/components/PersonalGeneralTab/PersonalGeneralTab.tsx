import { DeleteAccountSection } from "../DeleteAccountSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  return (
    <div className="flex flex-col gap-6">
      <UserNameSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
};
