import { AuthMethodSection } from "../AuthMethodSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { MFASection } from "../SecuritySection";

export const PersonalAuthTab = () => {
    return (
        <div>
            <MFASection />
            <AuthMethodSection />
            <ChangePasswordSection />
        </div>
    );
}