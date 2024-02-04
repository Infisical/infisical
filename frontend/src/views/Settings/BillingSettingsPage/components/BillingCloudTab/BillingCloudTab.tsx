import { CurrentPlanSection } from "./CurrentPlanSection";
import { PreviewSection } from "./PreviewSection";

export const BillingCloudTab = () => {
    return (
        <div>
            <PreviewSection />
            <CurrentPlanSection />
        </div>
    );
}