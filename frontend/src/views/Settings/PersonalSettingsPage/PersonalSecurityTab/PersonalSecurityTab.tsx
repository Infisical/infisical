import { ChangeLanguageSection } from "../ChangeLanguageSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SecuritySection } from "../SecuritySection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalSecurityTab = () => {
    return (
        <div>
            <UserNameSection />
            <ChangeLanguageSection />
            <SecuritySection />
            <SessionsSection />
            <ChangePasswordSection />
            <EmergencyKitSection />
        </div>
    );
}