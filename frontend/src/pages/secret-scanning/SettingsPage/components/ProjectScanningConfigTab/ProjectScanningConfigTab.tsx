import {
  AccessRestrictedNotice,
  Empty,
  EmptyHeader,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { useGetSecretScanningConfig } from "@app/hooks/api/secretScanningV2";

import { SecretScanningConfigForm } from "./SecretScanningConfigForm";

export const ProjectScanningConfigTab = () => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { data: config, isPending: isConfigPending } = useGetSecretScanningConfig(
    currentProject.id,
    { enabled: subscription.secretScanning }
  );

  if (!subscription.secretScanning) {
    return (
      <AccessRestrictedNotice
        title="Secret Scanning Not Available"
        description="Your current plan doesn't include Secret Scanning. Contact Infisical support or reach out on Slack to enable it."
      />
    );
  }

  if (isConfigPending) {
    return (
      <div className="h-32">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  if (!config) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Could not find Secret Scanning configuration</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <SecretScanningConfigForm config={config} />
    </div>
  );
};
