import { useQuery } from "@tanstack/react-query";
import { CheckIcon, LockIcon, PencilIcon, UnlockIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Detail, DetailLabel, DetailValue, UnstableIconButton } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { PamResourceType, TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
};

const SSLStatusBadge = ({ enabled }: { enabled: boolean }) => (
  <div className="flex items-center gap-2">
    {enabled ? (
      <LockIcon className="size-3.5 text-success" />
    ) : (
      <UnlockIcon className="size-3.5 text-warning" />
    )}
    <span>{enabled ? "Enabled" : "Disabled"}</span>
  </div>
);

const SqlConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number; database: string; sslEnabled: boolean };
}) => (
  <>
    <Detail>
      <DetailLabel>Host</DetailLabel>
      <DetailValue>{connectionDetails.host}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Port</DetailLabel>
      <DetailValue>{connectionDetails.port}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Database</DetailLabel>
      <DetailValue>{connectionDetails.database}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>SSL</DetailLabel>
      <DetailValue>
        <SSLStatusBadge enabled={connectionDetails.sslEnabled} />
      </DetailValue>
    </Detail>
  </>
);

const SSHConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number };
}) => (
  <>
    <Detail>
      <DetailLabel>Host</DetailLabel>
      <DetailValue>{connectionDetails.host}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Port</DetailLabel>
      <DetailValue>{connectionDetails.port}</DetailValue>
    </Detail>
  </>
);

const RedisConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number; sslEnabled: boolean };
}) => (
  <>
    <Detail>
      <DetailLabel>Host</DetailLabel>
      <DetailValue>{connectionDetails.host}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Port</DetailLabel>
      <DetailValue>{connectionDetails.port}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>SSL</DetailLabel>
      <DetailValue>
        <SSLStatusBadge enabled={connectionDetails.sslEnabled} />
      </DetailValue>
    </Detail>
  </>
);

const KubernetesConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { url: string; sslRejectUnauthorized: boolean };
}) => (
  <>
    <Detail>
      <DetailLabel>API URL</DetailLabel>
      <DetailValue className="truncate">{connectionDetails.url}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Verify SSL</DetailLabel>
      <DetailValue>
        <div className="flex items-center gap-2">
          {connectionDetails.sslRejectUnauthorized ? (
            <CheckIcon className="size-3.5 text-success" />
          ) : (
            <UnlockIcon className="size-3.5 text-warning" />
          )}
          <span>{connectionDetails.sslRejectUnauthorized ? "Yes" : "No"}</span>
        </div>
      </DetailValue>
    </Detail>
  </>
);

const AwsIamConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { roleArn: string };
}) => (
  <Detail>
    <DetailLabel>Role ARN</DetailLabel>
    <DetailValue className="truncate">{connectionDetails.roleArn}</DetailValue>
  </Detail>
);

const WindowsConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { protocol: string; hostname: string; port: number };
}) => (
  <>
    <Detail>
      <DetailLabel>Protocol</DetailLabel>
      <DetailValue>{connectionDetails.protocol.toUpperCase()}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Hostname</DetailLabel>
      <DetailValue>{connectionDetails.hostname}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Port</DetailLabel>
      <DetailValue>{connectionDetails.port}</DetailValue>
    </Detail>
  </>
);

const ConnectionDetailsContent = ({ resource }: Props) => {
  switch (resource.resourceType) {
    case PamResourceType.Postgres:
    case PamResourceType.MySQL:
      return <SqlConnectionDetails connectionDetails={resource.connectionDetails} />;
    case PamResourceType.SSH:
      return <SSHConnectionDetails connectionDetails={resource.connectionDetails} />;
    case PamResourceType.Redis:
      return <RedisConnectionDetails connectionDetails={resource.connectionDetails} />;
    case PamResourceType.Kubernetes:
      return <KubernetesConnectionDetails connectionDetails={resource.connectionDetails} />;
    case PamResourceType.AwsIam:
      return <AwsIamConnectionDetails connectionDetails={resource.connectionDetails} />;
    case PamResourceType.Windows:
      return <WindowsConnectionDetails connectionDetails={resource.connectionDetails} />;
    default:
      return null;
  }
};

export const PamResourceConnectionSection = ({
  resource,
  onEdit
}: Props & { onEdit: VoidFunction }) => {
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());

  const gateway = gateways?.find((g) => g.id === resource.gatewayId);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Connection</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-4">
        {resource.gatewayId && (
          <Detail>
            <DetailLabel>Gateway</DetailLabel>
            <DetailValue>{gateway?.name ?? "Unknown"}</DetailValue>
          </Detail>
        )}
        <ConnectionDetailsContent resource={resource} />
      </div>
    </div>
  );
};
