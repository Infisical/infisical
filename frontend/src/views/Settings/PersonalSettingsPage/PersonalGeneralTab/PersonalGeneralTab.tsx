import { ChangeLanguageSection } from "../ChangeLanguageSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SessionsSection } from "../SessionsSection";
import { UserNameSection } from "../UserNameSection";

export const PersonalGeneralTab = () => {
    return (
        <div>
            <UserNameSection />
            <ChangeLanguageSection />
            <SessionsSection />
            <EmergencyKitSection />
        </div>
    );
}