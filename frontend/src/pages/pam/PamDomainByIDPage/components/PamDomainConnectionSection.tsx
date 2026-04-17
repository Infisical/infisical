import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { PamDomainType, TPamDomain } from "@app/hooks/api/pamDomain";

type Props = {
  domain: TPamDomain;
  onEdit: VoidFunction;
};

const ActiveDirectoryConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { domain: string; dcAddress: string; port: number };
}) => (
  <DetailGroup>
    <Detail>
      <DetailLabel>Domain</DetailLabel>
      <DetailValue>{connectionDetails.domain}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>DC Address</DetailLabel>
      <DetailValue>{connectionDetails.dcAddress}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Port</DetailLabel>
      <DetailValue>{connectionDetails.port}</DetailValue>
    </Detail>
  </DetailGroup>
);

export const PamDomainConnectionSection = ({ domain, onEdit }: Props) => {
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());
  const gateway = gateways?.find((g) => g.id === domain.gatewayId);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Connection</h3>
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.PamDomains}>
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-4">
        {domain.gatewayId && (
          <Detail>
            <DetailLabel>Gateway</DetailLabel>
            <DetailValue>{gateway?.name ?? "Unknown"}</DetailValue>
          </Detail>
        )}
        {domain.domainType === PamDomainType.ActiveDirectory && (
          <ActiveDirectoryConnectionDetails connectionDetails={domain.connectionDetails} />
        )}
      </div>
    </div>
  );
};
