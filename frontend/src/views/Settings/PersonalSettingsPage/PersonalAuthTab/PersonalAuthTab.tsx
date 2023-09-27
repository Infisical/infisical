import { AuthMethodSection } from "../AuthMethodSection";
import { ChangePasswordSection } from "../ChangePasswordSection";
import { ConfigureMFA } from "../SecuritySection";

export const PersonalAuthTab = () => {
    return (
        <div>
            <ConfigureMFA />
            <AuthMethodSection />
            <ChangePasswordSection />
        </div>
    );
}