import { ChangePasswordSection } from "../ChangePasswordSection";
import { EmergencyKitSection } from "../EmergencyKitSection";
import { SecuritySection } from "../SecuritySection";
import { SessionsSection } from "../SessionsSection";

export const PersonalSecurityTab = () => {
    return (
        <div>
            <SecuritySection />
            <SessionsSection />
            <ChangePasswordSection />
            <EmergencyKitSection />
        </div>
    );
}