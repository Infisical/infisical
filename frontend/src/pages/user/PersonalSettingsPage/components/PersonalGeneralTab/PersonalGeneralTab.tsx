import { DeleteAccountSection } from "../DeleteAccountSection";
import { LanguageSection } from "../LanguageSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
  return (
    <div className="flex flex-col gap-6">
      <UserNameSection />
      <LanguageSection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
};
