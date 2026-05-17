import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { GatewayIdentityAuthConfig } from "@app/hooks/api/gateways-v2/types";

type Props = {
  config: GatewayIdentityAuthConfig;
};

export const ViewGatewayIdentityAuthContent = ({ config }: Props) => {
  const { currentOrg } = useOrganization();

  return (
    <Detail>
      <DetailLabel>Machine Identity</DetailLabel>
      <DetailValue>
        {config.identityName ? (
          <Link
            to="/organizations/$orgId/identities/$identityId"
            params={{ orgId: currentOrg.id, identityId: config.identityId }}
            className="inline-flex items-center gap-1 underline"
          >
            {config.identityName}
            <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
          </Link>
        ) : (
          <span className="text-muted">Identity has been deleted</span>
        )}
      </DetailValue>
    </Detail>
  );
};
