import { subject } from "@casl/ability";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  EditIcon,
  FileKeyIcon,
  FingerprintIcon,
  TrashIcon,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  DynamicSecretProviders,
  DynamicSecretStatus,
  TDynamicSecret
} from "@app/hooks/api/dynamicSecret/types";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

const DYNAMIC_SECRET_PROVIDER_NAMES: Record<DynamicSecretProviders, string> = {
  [DynamicSecretProviders.SqlDatabase]: "SQL Database",
  [DynamicSecretProviders.Cassandra]: "Cassandra",
  [DynamicSecretProviders.AwsIam]: "AWS IAM",
  [DynamicSecretProviders.Redis]: "Redis",
  [DynamicSecretProviders.AwsElastiCache]: "AWS ElastiCache",
  [DynamicSecretProviders.MongoAtlas]: "Mongo Atlas",
  [DynamicSecretProviders.ElasticSearch]: "Elastic Search",
  [DynamicSecretProviders.MongoDB]: "Mongo DB",
  [DynamicSecretProviders.RabbitMq]: "RabbitMQ",
  [DynamicSecretProviders.AzureEntraId]: "Azure Entra ID",
  [DynamicSecretProviders.AzureSqlDatabase]: "Azure SQL Database",
  [DynamicSecretProviders.Ldap]: "LDAP",
  [DynamicSecretProviders.SapHana]: "SAP HANA",
  [DynamicSecretProviders.Snowflake]: "Snowflake",
  [DynamicSecretProviders.Totp]: "TOTP",
  [DynamicSecretProviders.SapAse]: "SAP ASE",
  [DynamicSecretProviders.Kubernetes]: "Kubernetes",
  [DynamicSecretProviders.Vertica]: "Vertica",
  [DynamicSecretProviders.GcpIam]: "GCP IAM",
  [DynamicSecretProviders.Github]: "GitHub",
  [DynamicSecretProviders.Couchbase]: "Couchbase"
};

type DynamicSecretWithEnv = TDynamicSecret & { environment: string };

type Props = {
  dynamicSecretName: string;
  environments: { name: string; slug: string }[];
  isDynamicSecretInEnv: (name: string, env: string) => boolean;
  getDynamicSecretByName: (envSlug: string, name: string) => DynamicSecretWithEnv | undefined;
  getDynamicSecretStatusesByName: (
    name: string
  ) => (DynamicSecretStatus | null | undefined)[] | undefined;
  tableWidth: number;
  secretPath: string;
  onEdit: (dynamicSecret: DynamicSecretWithEnv) => void;
  onGenerateLease: (dynamicSecret: DynamicSecretWithEnv) => void;
  onDelete: (dynamicSecret: DynamicSecretWithEnv) => void;
  onForceDelete: (dynamicSecret: DynamicSecretWithEnv) => void;
};

export const DynamicSecretTableRow = ({
  dynamicSecretName,
  environments = [],
  isDynamicSecretInEnv,
  getDynamicSecretByName,
  getDynamicSecretStatusesByName,
  tableWidth,
  secretPath,
  onEdit,
  onGenerateLease,
  onDelete,
  onForceDelete
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);

  const isSingleEnvView = environments.length === 1;
  const totalCols = environments.length + 2;

  const statuses = getDynamicSecretStatusesByName(dynamicSecretName);

  const singleEnvSlug = isSingleEnvView ? environments[0].slug : "";
  const singleEnvDynamicSecret = isSingleEnvView
    ? getDynamicSecretByName(singleEnvSlug, dynamicSecretName)
    : undefined;

  const renderStatusIndicator = (dynamicSecret: DynamicSecretWithEnv) => {
    if (!dynamicSecret.status) return null;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangleIcon
            className={twMerge(
              "ml-2 size-4",
              dynamicSecret.status === DynamicSecretStatus.Deleting
                ? "text-yellow-600"
                : "text-red-600"
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{dynamicSecret.statusDetails || dynamicSecret.status}</TooltipContent>
      </Tooltip>
    );
  };

  const renderActionButtons = (dynamicSecret: DynamicSecretWithEnv) => {
    const isRevoking = dynamicSecret.status === DynamicSecretStatus.Deleting;

    return (
      <div className="flex items-center transition-all duration-500 group-hover:ml-2 group-hover:space-x-1.5">
        {dynamicSecret.type !== DynamicSecretProviders.Totp && (
          <ProjectPermissionCan
            I={ProjectPermissionDynamicSecretActions.Lease}
            a={subject(ProjectPermissionSub.DynamicSecrets, {
              environment: dynamicSecret.environment,
              secretPath,
              metadata: dynamicSecret.metadata
            })}
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                    isDisabled={!isAllowed || isRevoking}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateLease(dynamicSecret);
                    }}
                  >
                    <FileKeyIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Generate Lease</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        )}
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.EditRootCredential}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(dynamicSecret);
                  }}
                >
                  <EditIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
        {dynamicSecret.status === DynamicSecretStatus.FailedDeletion && (
          <ProjectPermissionCan
            I={ProjectPermissionDynamicSecretActions.DeleteRootCredential}
            a={subject(ProjectPermissionSub.DynamicSecrets, {
              environment: dynamicSecret.environment,
              secretPath,
              metadata: dynamicSecret.metadata
            })}
          >
            {(isAllowed) => (
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100 hover:text-danger"
                    isDisabled={!isAllowed}
                    onClick={(e) => {
                      e.stopPropagation();
                      onForceDelete(dynamicSecret);
                    }}
                  >
                    <XIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Force Delete</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        )}
        <ProjectPermissionCan
          I={ProjectPermissionDynamicSecretActions.DeleteRootCredential}
          a={subject(ProjectPermissionSub.DynamicSecrets, {
            environment: dynamicSecret.environment,
            secretPath,
            metadata: dynamicSecret.metadata
          })}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  className="w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100 hover:text-danger"
                  isDisabled={!isAllowed || isRevoking}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(dynamicSecret);
                  }}
                >
                  <TrashIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </ProjectPermissionCan>
      </div>
    );
  };

  return (
    <>
      <UnstableTableRow
        onClick={isSingleEnvView ? undefined : setIsExpanded.toggle}
        className="group"
      >
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-0 z-10",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-b-0 bg-container-hover"
          )}
        >
          {!isSingleEnvView && isExpanded ? (
            <ChevronDownIcon />
          ) : (
            <FingerprintIcon className="text-dynamic-secret" />
          )}
        </UnstableTableCell>
        <UnstableTableCell
          className={twMerge(
            !isSingleEnvView && "sticky left-10 z-10 border-r",
            "bg-container transition-colors duration-75 group-hover:bg-container-hover",
            !isSingleEnvView && isExpanded && "border-r-0 border-b-0 bg-container-hover"
          )}
          isTruncatable
          colSpan={isSingleEnvView ? 2 : undefined}
        >
          {isSingleEnvView && singleEnvDynamicSecret ? (
            <div className="flex w-full items-center">
              <span className="truncate">{dynamicSecretName}</span>
              <Badge variant="neutral" className="ml-2">
                {DYNAMIC_SECRET_PROVIDER_NAMES[singleEnvDynamicSecret.type]}
              </Badge>
              {renderStatusIndicator(singleEnvDynamicSecret)}
              <div className="ml-auto flex items-center">
                {renderActionButtons(singleEnvDynamicSecret)}
              </div>
            </div>
          ) : (
            <>
              {dynamicSecretName}
              {statuses?.some(
                (status) =>
                  status === DynamicSecretStatus.FailedDeletion ||
                  status === DynamicSecretStatus.Deleting
              ) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="absolute top-1/2 right-2 -translate-y-1/2" variant="danger">
                      <XIcon />
                      {statuses?.some((status) => status === DynamicSecretStatus.FailedDeletion)
                        ? "Deletion Failed"
                        : "Revoking"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>One or more dynamic secrets have issues.</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </UnstableTableCell>
        {environments.length > 1 &&
          environments.map(({ slug }, i) => {
            if (isExpanded)
              return (
                <UnstableTableCell
                  key={`sec-overview-${slug}-${i + 1}-dynamic-secret`}
                  className="border-b-0 bg-container-hover"
                />
              );

            const isPresent = isDynamicSecretInEnv(dynamicSecretName, slug);

            return (
              <ResourceEnvironmentStatusCell
                key={`sec-overview-${slug}-${i + 1}-dynamic-secret`}
                status={isPresent ? "present" : "missing"}
              />
            );
          })}
      </UnstableTableRow>
      {!isSingleEnvView && isExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={totalCols} className={`${isExpanded && "bg-card p-0"}`}>
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 flex flex-col gap-y-4 border-t-2 border-b-1 border-l-1 border-border border-x-project/50 bg-card p-4"
            >
              <UnstableTable containerClassName="border-none rounded-none bg-transparent">
                <UnstableTableHeader>
                  <UnstableTableRow>
                    <UnstableTableHead className="w-full">Environment</UnstableTableHead>
                    <UnstableTableHead />
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {environments
                    .filter((env) => {
                      const dynamicSecret = getDynamicSecretByName(env.slug, dynamicSecretName);
                      return Boolean(dynamicSecret);
                    })
                    .map(({ name: envName, slug }) => {
                      const dynamicSecret = getDynamicSecretByName(slug, dynamicSecretName)!;

                      return (
                        <UnstableTableRow key={slug} className="group relative">
                          <UnstableTableCell>
                            <div className="flex w-full flex-wrap items-center">
                              <span>{envName}</span>
                              <Badge variant="neutral" className="ml-2">
                                {DYNAMIC_SECRET_PROVIDER_NAMES[dynamicSecret.type]}
                              </Badge>
                              {renderStatusIndicator(dynamicSecret)}
                            </div>
                          </UnstableTableCell>
                          <UnstableTableCell>
                            <div className="flex items-center">
                              {renderActionButtons(dynamicSecret)}
                            </div>
                          </UnstableTableCell>
                        </UnstableTableRow>
                      );
                    })}
                </UnstableTableBody>
              </UnstableTable>
            </div>
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};
