import { useRouter } from "next/router";

import { Button } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { fetchSlackInstallUrl } from "@app/hooks/api/slack/queries";

export const NotificationTab = () => {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const [isConnectToSlackLoading, setIsConnectToSlackLoading] = useToggle(false);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">Slack Integration</h2>
      </div>

      <p className="mb-4 text-gray-400">
        This integration allows you send notifications to your Slack workspace in response to events
        in your project.
      </p>
      <Button
        isLoading={isConnectToSlackLoading}
        onClick={async () => {
          setIsConnectToSlackLoading.on();
          const slackInstallUrl = await fetchSlackInstallUrl(currentWorkspace?.id);
          if (slackInstallUrl) {
            router.push(slackInstallUrl);
          }
        }}
      >
        Connect to Slack
      </Button>
    </div>
  );
};
