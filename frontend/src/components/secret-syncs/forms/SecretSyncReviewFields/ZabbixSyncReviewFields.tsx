import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix";
import { SecretSync } from "@app/hooks/api/secretSyncs";

const isTextMacro = (macroType: number) => macroType === 0;

export const ZabbixSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Zabbix }>();
  const scope = watch("destinationConfig.scope");
  const hostId = watch("destinationConfig.hostId");
  const hostName = watch("destinationConfig.hostName");
  const macroType = watch("destinationConfig.macroType");

  return (
    <>
      <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
      {scope === ZabbixSyncScope.Host && (
        <>
          <GenericFieldLabel label="Host ID">{hostId}</GenericFieldLabel>
          <GenericFieldLabel label="Host Name">{hostName}</GenericFieldLabel>
        </>
      )}
      <GenericFieldLabel label="Macro Type">
        {isTextMacro(macroType) ? "Text" : "Secret"}
      </GenericFieldLabel>
    </>
  );
};
