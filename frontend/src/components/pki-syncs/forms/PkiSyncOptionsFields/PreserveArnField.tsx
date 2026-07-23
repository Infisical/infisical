import { SyncSwitchField } from "./SyncSwitchField";

export const PreserveArnField = () => (
  <SyncSwitchField
    name="syncOptions.preserveArn"
    id="preserve-arn"
    label="Preserve ARN on Renewal"
    description={
      <>
        When enabled, renewals replace the existing certificate&apos;s contents while keeping the
        same ARN, so consumers like load balancers need no manual updates. When disabled, a new ARN
        is created and the old certificate is removed.
      </>
    }
    defaultChecked
  />
);
