import { PageTitle } from "@app/components/PageTitle";
import { Button } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { WebReplayView } from "./components/WebReplayView";

export const PamWebRecordingPage = ({
  sessionId,
  timeMs
}: {
  sessionId: string;
  timeMs: number;
}) => {
  const { currentOrg } = useOrganization();
  return (
    <main className="space-y-4 p-6">
      <PageTitle title="Web App Recording" />
      <header className="flex items-center justify-between">
        <h1 className="font-alliance text-2xl">Web App Recording</h1>
        <Button asChild variant="outline">
          <a href={`/organizations/${currentOrg.id}/pam/sessions`}>Back to Sessions</a>
        </Button>
      </header>
      <WebReplayView sessionId={sessionId} initialTimeMs={timeMs} />
    </main>
  );
};
