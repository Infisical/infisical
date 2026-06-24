import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";
import { useServerConfig } from "@app/context";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { CrossProjectSharingSection } from "../CrossProjectSharingSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";

export const ProjectGeneralTab = () => {
  const { config } = useServerConfig();
  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      <AuditLogsRetentionSection />
      {config.isCrossProjectSecretSharingEnabled && <CrossProjectSharingSection />}
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
