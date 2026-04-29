import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { GatewayIdentityAuthConfig } from "@app/hooks/api/gateways-v2/types";

type Props = {
  config: GatewayIdentityAuthConfig;
};

export const ViewGatewayIdentityAuthContent = ({ config }: Props) => {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
      <Detail className="md:col-span-2">
        <DetailLabel>Identity</DetailLabel>
        <DetailValue>
          {config.identityName ? (
            <p className="break-words">{config.identityName}</p>
          ) : (
            <p className="text-muted">Identity has been deleted</p>
          )}
        </DetailValue>
      </Detail>
      <Detail className="md:col-span-2">
        <DetailLabel>Identity ID</DetailLabel>
        <DetailValue>
          <p className="font-mono text-xs break-words">{config.identityId || "—"}</p>
        </DetailValue>
      </Detail>
    </div>
  );
};
