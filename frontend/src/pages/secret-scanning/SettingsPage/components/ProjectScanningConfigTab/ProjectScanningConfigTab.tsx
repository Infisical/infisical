import { faBan } from "@fortawesome/free-solid-svg-icons";

import { AccessRestrictedBanner, ContentLoader, EmptyState } from "@app/components/v2";
import { useSubscription, useWorkspace } from "@app/context";
import { useGetSecretScanningConfig } from "@app/hooks/api/secretScanningV2";

import { SecretScanningConfigForm } from "./SecretScanningConfigForm";

export const ProjectScanningConfigTab = () => {
  const { currentWorkspace } = useWorkspace();
  const { subscription } = useSubscription();
  const { data: config, isPending: isConfigPending } = useGetSecretScanningConfig(
    currentWorkspace.id,
    { enabled: subscription.secretScanning }
  );

  if (!subscription.secretScanning) {
    return (
      <div className="mt-60 flex h-full w-full items-center justify-center px-20">
        <AccessRestrictedBanner
          body={
            <>
              Your current plan doesn&apos;t support Secret Scanning.
              <br /> Please contact Infisical Support or reach out through our Slack channel for
              assistance.
            </>
          }
        />
      </div>
    );
  }

  if (isConfigPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title="Could not find Project Configuration"
        />
      </div>
    );
  }

  return (
    <div>
      <SecretScanningConfigForm config={config} />
    </div>
  );
};
