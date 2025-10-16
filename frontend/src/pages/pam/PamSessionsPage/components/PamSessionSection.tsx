import { ContentLoader } from "@app/components/v2";
import { useProject } from "@app/context";
import { useListPamSessions } from "@app/hooks/api/pam";

import { PamSessionsTable } from "./PamSessionsTable";

export const PamSessionSection = () => {
  const { currentProject } = useProject();

  const { data: sessions = [], isPending } = useListPamSessions(currentProject.id, {
    refetchInterval: 30000
  });

  if (isPending) return <ContentLoader />;

  return <PamSessionsTable sessions={sessions} />;
};
