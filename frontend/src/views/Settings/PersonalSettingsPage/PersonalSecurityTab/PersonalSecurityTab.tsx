import { ChangeLanguageSection } from "../ChangeLanguageSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SecuritySection } from "../SecuritySection";
import { SessionsSection } from "../SessionsSection";

export const PersonalSecurityTab = () => {
    return (
        <div>
            <ChangeLanguageSection />
            <SecuritySection />
            <SessionsSection />
            <ChangePasswordSection />
            <EmergencyKitSection />
        </div>
    );
}