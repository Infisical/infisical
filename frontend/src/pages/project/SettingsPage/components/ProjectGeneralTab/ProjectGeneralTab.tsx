import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";
import { useOrganization, useServerConfig } from "@app/context";

import { AuditLogsRetentionSection } from "../AuditLogsRetentionSection";
import { CrossProjectSharingSection } from "../CrossProjectSharingSection";
import { DeleteProjectProtection } from "../DeleteProjectProtection";
import { DeleteProjectSection } from "../DeleteProjectSection";

export const ProjectGeneralTab = () => {
  const { config } = useServerConfig();
  const { currentOrg } = useOrganization();
  return (
    <div>
      <ProjectOverviewChangeSection showSlugField />
      <AuditLogsRetentionSection />
      {config.isCrossProjectSecretSharingEnabled && currentOrg.allowCrossProjectSecretSharing && (
        <CrossProjectSharingSection />
      )}
      <DeleteProjectProtection />
      <DeleteProjectSection />
    </div>
  );
};
