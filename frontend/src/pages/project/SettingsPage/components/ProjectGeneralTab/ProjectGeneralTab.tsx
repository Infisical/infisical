import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { CrossProjectSharingSection } from "../CrossProjectSharingSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";
import { useServerConfig } from "@app/context";

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
