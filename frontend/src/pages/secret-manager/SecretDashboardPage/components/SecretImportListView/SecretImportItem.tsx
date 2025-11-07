import { useEffect } from "react";
import { subject } from "@casl/ability";
import { useSortable } from "@dnd-kit/sortable";
import {
  faCalendarCheck,
  faFileImport,
  faFolder,
  faInfoCircle,
  faKey,
  faRotate,
  faSearch,
  faTrash,
  faUpDown,
  faWarning,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, IconButton, TableContainer, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useResyncSecretReplication } from "@app/hooks/api";
import { TSecretImport } from "@app/hooks/api/types";

import { SecretImportSecretRow } from "./SecretImportSecretRow";

type Props = {
  onDelete: () => void;
  environment: string;
  secretPath?: string;
  secretImport?: TSecretImport;
  isReplicationExpand?: boolean;
  importedSecrets: {
    key: string;
    value?: string;
    overridden: { env: string; secretPath: string };
    environment: string;
    secretPath?: string;
    isEmpty?: boolean;
  }[];
  searchTerm: string;
  onExpandReplicateSecrets: (id: string) => void;
};

// to show the environment and folder icon
export const EnvFolderIcon = ({
  env,
  secretPath
}: // isReplication
{
  env: string;
  secretPath: string;
  // isReplication?: boolean;
}) => (
  <div className="inline-flex items-center space-x-2">
    <div style={{ minWidth: "96px" }}>{env || "-"}</div>
    {secretPath && (
      <div className="inline-flex items-center space-x-2 border-l border-mineshaft-600 pl-2">
        {/* {isReplication && <Tag size="xs">Replication Mode</Tag>} */}
        <FontAwesomeIcon icon={faFolder} className="text-md text-green-700" />
        <span>{secretPath}</span>
      </div>
    )}
  </div>
);

export const SecretImportItem = ({
  onDelete,
  isReplicationExpand,
  importedSecrets = [],
  searchTerm = "",
  secretPath = "/",
  environment,
  secretImport,
  onExpandReplicateSecrets: onExpandReplicate
}: Props) => {
  const {
    isReserved,
    id,
    isReplication,
    isReplicationSuccess,
    replicationStatus,
    lastReplicated,
    importEnv
  } = secretImport as TSecretImport;
  const { currentProject } = useProject();
  const [isExpanded, setIsExpanded] = useToggle();
  const { attributes, listeners, transform, transition, setNodeRef, isDragging } = useSortable({
    id
  });
  const resyncSecretReplication = useResyncSecretReplication();
  useEffect(() => {
    const filteredSecrets = importedSecrets.filter((secret) =>
      secret.key.toUpperCase().includes(searchTerm.toUpperCase())
    );

    if (filteredSecrets.length > 0 && searchTerm) {
      setIsExpanded.on();
    } else {
      setIsExpanded.off();
    }
  }, [searchTerm]);

  useEffect(() => {
    if (isDragging) {
      setIsExpanded.off();
    }
  }, [isDragging]);

  const style = {
    transform: transform ? `translateY(${transform.y ? Math.round(transform.y) : 0}px)` : "",
    transition
  };

  const handleResyncSecretReplication = async () => {
    if (resyncSecretReplication.isPending) return;
    await resyncSecretReplication.mutateAsync({
      id,
      environment,
      path: secretPath,
      projectId: currentProject?.id || ""
    });
    createNotification({
      text: "Please refresh the dashboard to view changes",
      type: "success"
    });
  };

  const handleRowClick = () => {
    if (isReplication) {
      onExpandReplicate(id);
    } else {
      setIsExpanded.toggle();
    }
  };

  const filteredImportedSecrets = importedSecrets.filter((secret) =>
    secret.key.toUpperCase().includes(searchTerm.toUpperCase())
  );

  return (
    <>
      <div
        className={twMerge(
          "group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700",
          isReserved && "hidden"
        )}
        role="button"
        ref={setNodeRef}
        tabIndex={0}
        style={style}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleRowClick();
          }
        }}
      >
        <div className="flex w-11 items-center py-2 pl-5 text-green-700">
          <FontAwesomeIcon icon={faFileImport} />
        </div>
        <div className="flex grow items-center py-2 pr-2 pl-4">
          <EnvFolderIcon
            env={importEnv.slug || ""}
            secretPath={secretImport?.importPath || ""}
            // isReplication={isReplication}
          />
        </div>
        <div className="flex items-center space-x-4 py-2 pr-4">
          {lastReplicated && (
            <Tooltip
              position="left"
              className="max-w-md break-words whitespace-normal"
              content={
                <div className="flex max-h-40 flex-col overflow-auto">
                  <div className="flex self-start">
                    <FontAwesomeIcon icon={faCalendarCheck} className="pt-0.5 pr-2 text-sm" />
                    <div className="text-sm">Last Replication</div>
                  </div>
                  <div className="pl-5 text-left text-xs">
                    {lastReplicated
                      ? format(new Date(lastReplicated), "yyyy-MM-dd, hh:mm aaa")
                      : "-"}
                  </div>
                  {!isReplicationSuccess && (
                    <>
                      <div className="mt-2 flex self-start">
                        <FontAwesomeIcon icon={faXmark} className="pt-1 pr-2 text-sm" />
                        <div className="text-sm">Fail reason</div>
                      </div>
                      <div className="pl-5 text-left text-xs">{replicationStatus}</div>
                    </>
                  )}
                </div>
              }
            >
              <div
                className={twMerge(
                  "opacity-0 group-hover:opacity-100",
                  !isReplicationSuccess && "text-red-600"
                )}
              >
                <FontAwesomeIcon icon={isReplicationSuccess ? faInfoCircle : faWarning} />
              </div>
            </Tooltip>
          )}
          {isReplication && (
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={subject(ProjectPermissionSub.SecretImports, { environment, secretPath })}
              renderTooltip
              allowedLabel="Resync replicated secrets"
            >
              {(isAllowed) => (
                <IconButton
                  size="md"
                  colorSchema="primary"
                  variant="plain"
                  ariaLabel="expand"
                  className={twMerge(
                    "p-0 opacity-0 group-hover:opacity-100",
                    resyncSecretReplication.isPending && "animate-spin opacity-100"
                  )}
                  isDisabled={!isAllowed}
                  onClick={handleResyncSecretReplication}
                >
                  <FontAwesomeIcon icon={faRotate} />
                </IconButton>
              )}
            </ProjectPermissionCan>
          )}
        </div>
        <div className="flex w-16 items-center justify-between border-l border-mineshaft-600 py-3.5 pr-3 pl-4">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={subject(ProjectPermissionSub.SecretImports, {
              environment,
              secretPath: secretPath || "/"
            })}
            renderTooltip
            allowedLabel="Change order"
          >
            {(isAllowed) => (
              <IconButton
                size="md"
                colorSchema="primary"
                variant="plain"
                ariaLabel="expand"
                className="p-0 opacity-0 group-hover:opacity-100"
                {...attributes}
                {...listeners}
                isDisabled={!isAllowed}
              >
                <FontAwesomeIcon icon={faUpDown} />
              </IconButton>
            )}
          </ProjectPermissionCan>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={subject(ProjectPermissionSub.SecretImports, { environment, secretPath })}
            renderTooltip
            allowedLabel="Delete"
          >
            {(isAllowed) => (
              <IconButton
                size="md"
                variant="plain"
                colorSchema="danger"
                ariaLabel="delete"
                className="p-0 opacity-0 group-hover:opacity-100"
                onClick={(evt) => {
                  evt.stopPropagation();
                  onDelete();
                }}
                isDisabled={!isAllowed}
              >
                <FontAwesomeIcon icon={faTrash} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      {!isReplication && (isReplicationExpand || isExpanded) && !isDragging && (
        <td
          colSpan={3}
          className={`bg-bunker-800 ${isExpanded && "border-b-2 border-mineshaft-500"}`}
        >
          <div className="rounded-md bg-bunker-700 p-1">
            <TableContainer>
              <table className="secret-table">
                <thead>
                  <tr>
                    <td style={{ padding: "0.25rem 1rem" }}>Key</td>
                    <td style={{ padding: "0.25rem 1rem" }}>Value</td>
                  </tr>
                </thead>
                <tbody>
                  {importedSecrets?.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <EmptyState title="No secrets found" icon={faKey} />
                      </td>
                    </tr>
                  )}
                  {filteredImportedSecrets.length === 0 && importedSecrets?.length !== 0 && (
                    <tr>
                      <td colSpan={3}>
                        <EmptyState title="No secrets match search" icon={faSearch} />
                      </td>
                    </tr>
                  )}
                  {filteredImportedSecrets.map((secret, index) => (
                    <SecretImportSecretRow
                      secret={secret}
                      key={`${id}-${secret.key}-${index + 1}`}
                    />
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </div>
        </td>
      )}
    </>
  );
};
