import { ServiceTokenSection } from "../ServiceTokenSection";
import { ServiceTokenV3Section } from "../ServiceTokenV3Section";

export const ProjectServiceTokensTab = () => {
    return (
        <>
            {process.env.NEXT_PUBLIC_AGENT_FEATURE_FLAG === "true" ? <ServiceTokenV3Section /> : null}
            <ServiceTokenSection />
        </>
    );
}