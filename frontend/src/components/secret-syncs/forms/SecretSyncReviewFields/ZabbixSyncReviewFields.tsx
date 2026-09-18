import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{scope}</DetailValue>
      </Detail>
      {scope === ZabbixSyncScope.Host && (
        <>
          <Detail>
            <DetailLabel>Host ID</DetailLabel>
            <DetailValue>{hostId}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Host Name</DetailLabel>
            <DetailValue>{hostName}</DetailValue>
          </Detail>
        </>
      )}
      <Detail>
        <DetailLabel>Macro Type</DetailLabel>
        <DetailValue>{isTextMacro(macroType) ? "Text" : "Secret"}</DetailValue>
      </Detail>
    </>
  );
};
