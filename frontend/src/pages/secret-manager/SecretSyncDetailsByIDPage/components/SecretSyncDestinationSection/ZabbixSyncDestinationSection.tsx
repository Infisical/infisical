import { GenericFieldLabel } from "@app/components/secret-syncs";
import { ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix";
import { TZabbixSync } from "@app/hooks/api/secretSyncs/types/zabbix-sync";

type Props = {
  secretSync: TZabbixSync;
};

export const ZabbixSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { macroType }
  } = secretSync;

  return (
    <>
      {secretSync.destinationConfig.scope === ZabbixSyncScope.Host && (
        <>
          <GenericFieldLabel label="Host Name">
            {secretSync.destinationConfig.hostName}
          </GenericFieldLabel>
          <GenericFieldLabel label="Host ID">
            {secretSync.destinationConfig.hostId}
          </GenericFieldLabel>
        </>
      )}
      <GenericFieldLabel label="Macro Type">
        {macroType === 0 ? "Text" : "Secret"}
      </GenericFieldLabel>
    </>
  );
};
