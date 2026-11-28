import {
  AddDevicePostureProviderMenu,
  DevicePostureProviderList
} from "@app/pages/pam/components/policyEditors/DevicePosturePolicyEditor";

import { TDraftCondition } from "./autoApprovalDraft";

type Props = {
  condition: TDraftCondition;
  onChange: (condition: TDraftCondition) => void;
};

export const AutoApprovalDevicePostureCondition = ({ condition, onChange }: Props) => {
  const providers = condition.devicePosture?.providers ?? [];
  const setProviders = (next: typeof providers) =>
    onChange({ ...condition, devicePosture: { providers: next } });

  return (
    <div className="flex flex-col items-start gap-3 pt-1 pb-1">
      {providers.length > 0 && (
        <div className="w-full">
          <DevicePostureProviderList providers={providers} onChange={setProviders} />
        </div>
      )}
      <AddDevicePostureProviderMenu
        providers={providers}
        align="start"
        variant="ghost"
        onAdd={(config) => setProviders([...providers, config])}
      />
      <p className="px-1.5 text-xs text-muted">
        The requester checks their device with the Infisical CLI when they submit the request. A
        device that fails, or a request without a device check, goes to the approvers. Sessions can
        only start from the device that was checked.
      </p>
    </div>
  );
};
