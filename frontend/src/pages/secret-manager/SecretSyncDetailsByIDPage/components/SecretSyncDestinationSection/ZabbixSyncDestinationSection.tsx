import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix";
import { TZabbixSync } from "@app/hooks/api/secretSyncs/types/zabbix-sync";

type Props = {
  secretSync: TZabbixSync;
};

const isTextMacro = (macroType: number) => macroType === 0;

export const ZabbixSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { macroType }
  } = secretSync;

  return (
    <>
      {secretSync.destinationConfig.scope === ZabbixSyncScope.Host && (
        <>
          <Detail>
            <DetailLabel>Host Name</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.hostName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Host ID</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.hostId}</DetailValue>
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
