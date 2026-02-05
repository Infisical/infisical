import { faCheck, faEdit, faLock, faUnlock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, IconButton } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { PamResourceType, TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
};

const SSLStatusBadge = ({ enabled }: { enabled: boolean }) => (
  <div className="flex items-center gap-2">
    <FontAwesomeIcon
      icon={enabled ? faLock : faUnlock}
      className={enabled ? "text-green-500" : "text-yellow-500"}
    />
    <span>{enabled ? "Enabled" : "Disabled"}</span>
  </div>
);

const SqlConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number; database: string; sslEnabled: boolean };
}) => (
  <>
    <GenericFieldLabel label="Host">{connectionDetails.host}</GenericFieldLabel>
    <GenericFieldLabel label="Port">{connectionDetails.port}</GenericFieldLabel>
    <GenericFieldLabel label="Database">{connectionDetails.database}</GenericFieldLabel>
    <GenericFieldLabel label="SSL">
      <SSLStatusBadge enabled={connectionDetails.sslEnabled} />
    </GenericFieldLabel>
  </>
);

const SSHConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number };
}) => (
  <>
    <GenericFieldLabel label="Host">{connectionDetails.host}</GenericFieldLabel>
    <GenericFieldLabel label="Port">{connectionDetails.port}</GenericFieldLabel>
  </>
);

const RedisConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { host: string; port: number; sslEnabled: boolean };
}) => (
  <>
    <GenericFieldLabel label="Host">{connectionDetails.host}</GenericFieldLabel>
    <GenericFieldLabel label="Port">{connectionDetails.port}</GenericFieldLabel>
    <GenericFieldLabel label="SSL">
      <SSLStatusBadge enabled={connectionDetails.sslEnabled} />
    </GenericFieldLabel>
  </>
);

const KubernetesConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { url: string; sslRejectUnauthorized: boolean };
}) => (
  <>
    <GenericFieldLabel label="API URL" truncate>
      {connectionDetails.url}
    </GenericFieldLabel>
    <GenericFieldLabel label="Verify SSL">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon
          icon={connectionDetails.sslRejectUnauthorized ? faCheck : faUnlock}
          className={connectionDetails.sslRejectUnauthorized ? "text-green-500" : "text-yellow-500"}
        />
        <span>{connectionDetails.sslRejectUnauthorized ? "Yes" : "No"}</span>
      </div>
    </GenericFieldLabel>
  </>
);

const AwsIamConnectionDetails = ({
  connectionDetails
}: {
  connectionDetails: { roleArn: string };
}) => (
  <GenericFieldLabel label="Role ARN" truncate>
    {connectionDetails.roleArn}
  </GenericFieldLabel>
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
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Connection</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="Edit resource details"
              onClick={onEdit}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-3">
        {resource.gatewayId && (
          <GenericFieldLabel label="Gateway">{gateway?.name ?? "Unknown"}</GenericFieldLabel>
        )}
        <ConnectionDetailsContent resource={resource} />
      </div>
    </div>
  );
};
