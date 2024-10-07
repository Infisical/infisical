import { Badge, Td, Tooltip, Tr } from "@app/components/v2";
import { eventToNameMap, userAgentTTypeoNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import { Actor, AuditLog, Event } from "@app/hooks/api/auditLogs/types";

type Props = {
  auditLog: AuditLog;
  isOrgAuditLogs?: boolean;
  showActorColumn: boolean;
};

export const LogsTableRow = ({ auditLog, isOrgAuditLogs, showActorColumn }: Props) => {
  const renderActor = (actor: Actor) => {
    switch (actor.type) {
      case ActorType.USER:
        return (
          <Td>
            <p>{actor.metadata.email}</p>
            <p>User</p>
          </Td>
        );
      case ActorType.SERVICE:
        return (
          <Td>
            <p>{`${actor.metadata.name}`}</p>
            <p>Service token</p>
          </Td>
        );
      case ActorType.IDENTITY:
        return (
          <Td>
            <p>{`${actor.metadata.name}`}</p>
            <p>Machine Identity</p>
          </Td>
        );
      default:
        return <Td />;
    }
  };

  const renderMetadata = (event: Event) => {
    const metadataKeys = Object.keys(event.metadata);

    switch (event.type) {
      case EventType.GET_SECRETS:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            <p>{`# Secrets: ${event.metadata.numberOfSecrets}`}</p>
          </Td>
        );
      case EventType.GET_SECRET:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            <p>{`Secret: ${event.metadata.secretKey}`}</p>
          </Td>
        );
      case EventType.CREATE_SECRET:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            <p>{`Secret: ${event.metadata.secretKey}`}</p>
          </Td>
        );
      case EventType.UPDATE_SECRET:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            <p>{`Secret: ${event.metadata.secretKey}`}</p>
          </Td>
        );
      case EventType.DELETE_SECRET:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            <p>{`Secret: ${event.metadata.secretKey}`}</p>
          </Td>
        );
      case EventType.AUTHORIZE_INTEGRATION:
        return (
          <Td>
            <p>{`Integration: ${event.metadata.integration}`}</p>
          </Td>
        );
      case EventType.UNAUTHORIZE_INTEGRATION:
        return (
          <Td>
            <p>{`Integration: ${event.metadata.integration}`}</p>
          </Td>
        );
      case EventType.CREATE_INTEGRATION:
        return (
          <Td>
            <p>{`Integration: ${event.metadata.integration}`}</p>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            {event.metadata.app && <p>{`Target app: ${event.metadata.app}`}</p>}
            {event.metadata.appId && <p>{`Target app: ${event.metadata.appId}`}</p>}
            {event.metadata.targetEnvironment && (
              <p>{`Target environment: ${event.metadata.targetEnvironment}`}</p>
            )}
            {event.metadata.targetEnvironmentId && (
              <p>{`Target environment ID: ${event.metadata.targetEnvironmentId}`}</p>
            )}
          </Td>
        );
      case EventType.DELETE_INTEGRATION:
        return (
          <Td>
            <p>{`Integration: ${event.metadata.integration}`}</p>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.secretPath}`}</p>
            {event.metadata.app && <p>{`Target App: ${event.metadata.app}`}</p>}
            {event.metadata.appId && <p>{`Target app: ${event.metadata.appId}`}</p>}
            {event.metadata.targetEnvironment && (
              <p>{`Target environment: ${event.metadata.targetEnvironment}`}</p>
            )}
            {event.metadata.targetEnvironmentId && (
              <p>{`Target environment ID: ${event.metadata.targetEnvironmentId}`}</p>
            )}
          </Td>
        );
      case EventType.ADD_TRUSTED_IP:
        return (
          <Td>
            <p>{`IP: ${event.metadata.ipAddress}${
              event.metadata.prefix !== undefined ? `/${event.metadata.prefix}` : ""
            }`}</p>
          </Td>
        );
      case EventType.UPDATE_TRUSTED_IP:
        return (
          <Td>
            <p>{`IP: ${event.metadata.ipAddress}${
              event.metadata.prefix !== undefined ? `/${event.metadata.prefix}` : ""
            }`}</p>
          </Td>
        );
      case EventType.DELETE_TRUSTED_IP:
        return (
          <Td>
            <p>{`IP: ${event.metadata.ipAddress}${
              event.metadata.prefix !== undefined ? `/${event.metadata.prefix}` : ""
            }`}</p>
          </Td>
        );
      case EventType.CREATE_SERVICE_TOKEN:
        return (
          <Td>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.DELETE_SERVICE_TOKEN:
        return (
          <Td>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.CREATE_IDENTITY:
        return (
          <Td>
            <p>{`ID: ${event.metadata.identityId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.UPDATE_IDENTITY:
        return (
          <Td>
            <p>{`ID: ${event.metadata.identityId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.DELETE_IDENTITY:
        return (
          <Td>
            <p>{`ID: ${event.metadata.identityId}`}</p>
          </Td>
        );
      case EventType.CREATE_ENVIRONMENT:
        return (
          <Td>
            <p>{`Name: ${event.metadata.name}`}</p>
            <p>{`Slug: ${event.metadata.slug}`}</p>
          </Td>
        );
      case EventType.UPDATE_ENVIRONMENT:
        return (
          <Td>
            <p>{`Old name: ${event.metadata.oldName}`}</p>
            <p>{`New name: ${event.metadata.newName}`}</p>
            <p>{`Old slug: ${event.metadata.oldSlug}`}</p>
            <p>{`New slug: ${event.metadata.newSlug}`}</p>
          </Td>
        );
      case EventType.DELETE_ENVIRONMENT:
        return (
          <Td>
            <p>{`Name: ${event.metadata.name}`}</p>
            <p>{`Slug: ${event.metadata.slug}`}</p>
          </Td>
        );
      case EventType.ADD_WORKSPACE_MEMBER:
        return (
          <Td>
            <p>{`Email: ${event.metadata.email}`}</p>
          </Td>
        );
      case EventType.REMOVE_WORKSPACE_MEMBER:
        return (
          <Td>
            <p>{`Email: ${event.metadata.email}`}</p>
          </Td>
        );
      case EventType.CREATE_FOLDER:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.folderPath}`}</p>
            <p>{`Folder: ${event.metadata.folderName}`}</p>
          </Td>
        );
      case EventType.UPDATE_FOLDER:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.folderPath}`}</p>
            <p>{`Old folder: ${event.metadata.oldFolderName}`}</p>
            <p>{`New folder: ${event.metadata.newFolderName}`}</p>
          </Td>
        );
      case EventType.DELETE_FOLDER:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Path: ${event.metadata.folderPath}`}</p>
            <p>{`Folder: ${event.metadata.folderName}`}</p>
          </Td>
        );
      case EventType.CREATE_WEBHOOK:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Secret path: ${event.metadata.secretPath}`}</p>
            <p>{`Disabled: ${event.metadata.isDisabled}`}</p>
          </Td>
        );
      case EventType.UPDATE_WEBHOOK_STATUS:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Secret path: ${event.metadata.secretPath}`}</p>
            <p>{`Disabled: ${event.metadata.isDisabled}`}</p>
          </Td>
        );
      case EventType.DELETE_WEBHOOK:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`Secret path: ${event.metadata.secretPath}`}</p>
            <p>{`Disabled: ${event.metadata.isDisabled}`}</p>
          </Td>
        );
      case EventType.GET_SECRET_IMPORTS:
        return (
          <Td>
            <p>{`Environment: ${event.metadata.environment}`}</p>
            <p>{`# Imported paths: ${event.metadata.numberOfImports}`}</p>
          </Td>
        );
      case EventType.CREATE_SECRET_IMPORT:
        return (
          <Td>
            <p>{`Import from env: ${event.metadata.importFromEnvironment}`}</p>
            <p>{`Import from path: ${event.metadata.importFromSecretPath}`}</p>
            <p>{`Import to env: ${event.metadata.importToEnvironment}`}</p>
            <p>{`Import to path: ${event.metadata.importToSecretPath}`}</p>
          </Td>
        );
      case EventType.UPDATE_SECRET_IMPORT:
        return (
          <Td>
            <p>{`Import to env: ${event.metadata.importToEnvironment}`}</p>
            <p>{`Import to path: ${event.metadata.importToSecretPath}`}</p>
          </Td>
        );
      case EventType.DELETE_SECRET_IMPORT:
        return (
          <Td>
            <p>{`Import from env: ${event.metadata.importFromEnvironment}`}</p>
            <p>{`Import from path: ${event.metadata.importFromSecretPath}`}</p>
            <p>{`Import to env: ${event.metadata.importToEnvironment}`}</p>
            <p>{`Import to path: ${event.metadata.importToSecretPath}`}</p>
          </Td>
        );
      case EventType.UPDATE_USER_WORKSPACE_ROLE:
        return (
          <Td>
            <p>{`Email: ${event.metadata.email}`}</p>
            <p>{`Old role: ${event.metadata.oldRole}`}</p>
            <p>{`New role: ${event.metadata.newRole}`}</p>
          </Td>
        );
      case EventType.UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS:
        return (
          <Td>
            <p>{`Email: ${event.metadata.email}`}</p>
            {event.metadata.deniedPermissions.map((permission) => {
              return (
                <p
                  key={`audit-log-denied-permission-${event.metadata.userId}-${permission.environmentSlug}-${permission.ability}`}
                >
                  {`Denied env-ability: ${permission.environmentSlug}-${permission.ability}`}
                </p>
              );
            })}
          </Td>
        );
      case EventType.ORG_ADMIN_ACCESS_PROJECT:
        return (
          <Td>
            <p>{`Email: ${event.metadata.email}`}</p>
          </Td>
        );
      case EventType.CREATE_PKI_ALERT:
      case EventType.UPDATE_PKI_ALERT:
        return (
          <Td>
            <p>{`Alert ID: ${event.metadata.pkiAlertId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
            <p>{`Alert Before Days: ${event.metadata.alertBeforeDays}`}</p>
          </Td>
        );
      case EventType.GET_PKI_ALERT:
      case EventType.DELETE_PKI_ALERT:
        return (
          <Td>
            <p>{`Alert ID: ${event.metadata.pkiAlertId}`}</p>
          </Td>
        );
      case EventType.CREATE_PKI_COLLECTION:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.UPDATE_PKI_COLLECTION:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
          </Td>
        );
      case EventType.GET_PKI_COLLECTION:
      case EventType.DELETE_PKI_COLLECTION:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
          </Td>
        );
      case EventType.GET_PKI_COLLECTION_ITEMS:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
          </Td>
        );
      case EventType.ADD_PKI_COLLECTION_ITEM:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
            <p>{`Collection Item ID: ${event.metadata.pkiCollectionItemId}`}</p>
            <p>{`Type: ${event.metadata.type}`}</p>
            <p>{`Item ID: ${event.metadata.itemId}`}</p>
          </Td>
        );
      case EventType.DELETE_PKI_COLLECTION_ITEM:
        return (
          <Td>
            <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
            <p>{`Collection Item ID: ${event.metadata.pkiCollectionItemId}`}</p>
          </Td>
        );
      case EventType.CREATE_CA:
      case EventType.GET_CA:
      case EventType.UPDATE_CA:
      case EventType.DELETE_CA:
      case EventType.GET_CA_CSR:
      case EventType.GET_CA_CERT:
      case EventType.IMPORT_CA_CERT:
      case EventType.GET_CA_CRL:
      case EventType.SIGN_INTERMEDIATE:
      case EventType.ISSUE_CERT:
        return (
          <Td>
            <p>{`CA DN: ${event.metadata.dn}`}</p>
          </Td>
        );
      case EventType.GET_CERT:
      case EventType.DELETE_CERT:
      case EventType.REVOKE_CERT:
      case EventType.GET_CERT_BODY:
        return (
          <Td>
            <p>{`Cert CN: ${event.metadata.cn}`}</p>
          </Td>
        );
      case EventType.CREATE_CERTIFICATE_TEMPLATE:
      case EventType.UPDATE_CERTIFICATE_TEMPLATE:
        return (
          <Td>
            <p>{`Certificate Template ID: ${event.metadata.certificateTemplateId}`}</p>
            <p>{`Certificate Authority ID: ${event.metadata.caId}`}</p>
            <p>{`Name: ${event.metadata.name}`}</p>
            <p>{`Common Name: ${event.metadata.commonName}`}</p>
            <p>{`Subject Alternative Name: ${event.metadata.subjectAlternativeName}`}</p>
            <p>{`TTL: ${event.metadata.ttl}`}</p>
            {event.metadata.pkiCollectionId && (
              <p>{`Collection ID: ${event.metadata.pkiCollectionId}`}</p>
            )}
          </Td>
        );
      case EventType.GET_CERTIFICATE_TEMPLATE:
      case EventType.DELETE_CERTIFICATE_TEMPLATE:
        return (
          <Td>
            <p>{`Certificate Template ID: ${event.metadata.certificateTemplateId}`}</p>
          </Td>
        );
      case EventType.CREATE_CERTIFICATE_TEMPLATE_EST_CONFIG:
      case EventType.UPDATE_CERTIFICATE_TEMPLATE_EST_CONFIG:
        return (
          <Td>
            <p>{`Certificate Template ID: ${event.metadata.certificateTemplateId}`}</p>
            <p>{`Enabled: ${event.metadata.isEnabled}`}</p>
          </Td>
        );
      case EventType.GET_CERTIFICATE_TEMPLATE_EST_CONFIG:
        return (
          <Td>
            <p>{`Certificate Template ID: ${event.metadata.certificateTemplateId}`}</p>
          </Td>
        );
      case EventType.GET_PROJECT_SLACK_CONFIG:
        return (
          <Td>
            <p>{`Project Slack Config ID: ${event.metadata.id}`}</p>
          </Td>
        );
      case EventType.UPDATE_PROJECT_SLACK_CONFIG:
        return (
          <Td>
            <p>{`Project Slack Config ID: ${event.metadata.id}`}</p>
            <p>{`Slack integration ID: ${event.metadata.slackIntegrationId}`}</p>
            <p>{`Access Request Notification Status: ${event.metadata.isAccessRequestNotificationEnabled}`}</p>
            <p>{`Access Request Channels: ${event.metadata.accessRequestChannels}`}</p>
            <p>{`Secret Approval Request Notification Status: ${event.metadata.isSecretRequestNotificationEnabled}`}</p>
            <p>{`Secret Request Channels: ${event.metadata.secretRequestChannels}`}</p>
          </Td>
        );

      case EventType.INTEGRATION_SYNCED:
        return (
          <Td>
            <Tooltip
              className="max-w-xs whitespace-normal break-words"
              content={event.metadata.syncMessage!}
              isDisabled={!event.metadata.syncMessage}
            >
              <Badge variant={event.metadata.isSynced ? "success" : "danger"}>
                <p className="text-center">{event.metadata.isSynced ? "Successful" : "Failed"}</p>
              </Badge>
            </Tooltip>
          </Td>
        );

      case EventType.GET_WORKSPACE_KEY:
        return (
          <Td>
            <p>{`Key ID: ${event.metadata.keyId}`}</p>
          </Td>
        );

      case EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH:
      case EventType.ADD_IDENTITY_UNIVERSAL_AUTH:
      case EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH:
      case EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS:
        return (
          <Td>
            <p>{`Identity ID: ${event.metadata.identityId}`}</p>
          </Td>
        );

      case EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET:
      case EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET:
        return (
          <Td>
            <p>{`Identity ID: ${event.metadata.identityId}`}</p>
            <p>{`Client Secret ID: ${event.metadata.clientSecretId}`}</p>
          </Td>
        );

      // ? If for some reason non the above events are matched, we will display the first 3 metadata items in the metadata object.
      default:
        if (metadataKeys.length) {
          const maxMetadataLength = metadataKeys.length > 3 ? 3 : metadataKeys.length;
          return (
            <Td>
              {Object.entries(event.metadata)
                .slice(0, maxMetadataLength)
                .map(([key, value]) => {
                  return <p key={`audit-log-metadata-${key}`}>{`${key}: ${value}`}</p>;
                })}
            </Td>
          );
        }
        return <Td />;
    }
  };

  const formatDate = (dateToFormat: string) => {
    const date = new Date(dateToFormat);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");

    // convert from 24h to 12h format
    const period = hours >= 12 ? "PM" : "AM";
    hours %= 12;
    hours = hours || 12; // the hour '0' should be '12'

    const formattedDate = `${day}-${month}-${year} at ${hours}:${minutes} ${period}`;
    return formattedDate;
  };

  const renderSource = () => {
    const { event, actor } = auditLog;

    if (event.type === EventType.INTEGRATION_SYNCED) {
      if (actor.type === ActorType.USER) {
        return (
          <Td>
            <p>Manually triggered by {actor.metadata.email}</p>
          </Td>
        );
      }

      // Platform / automatic syncs
      return (
        <Td>
          <p>Automatically synced by Infisical</p>
        </Td>
      );
    }

    return (
      <Td>
        <p>{userAgentTTypeoNameMap[auditLog.userAgentType]}</p>
        <p>{auditLog.ipAddress}</p>
      </Td>
    );
  };

  return (
    <Tr className={`log-${auditLog.id} h-10 border-x-0 border-b border-t-0`}>
      <Td>{formatDate(auditLog.createdAt)}</Td>
      <Td>{`${eventToNameMap[auditLog.event.type]}`}</Td>
      {isOrgAuditLogs && <Td>{auditLog?.projectName ?? "N/A"}</Td>}
      {showActorColumn && renderActor(auditLog.actor)}
      {renderSource()}
      {renderMetadata(auditLog.event)}
    </Tr>
  );
};
