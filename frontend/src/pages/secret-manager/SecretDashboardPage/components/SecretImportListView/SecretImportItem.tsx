import { useEffect } from "react";
import { subject } from "@casl/ability";
import { useSortable } from "@dnd-kit/sortable";
import {
  faCalendarCheck,
  faClose,
  faFileImport,
  faFolder,
  faInfoCircle,
  faKey,
  faRotate,
  faSearch,
  faUpDown,
  faWarning,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, IconButton, SecretInput, TableContainer, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useResyncSecretReplication } from "@app/hooks/api";
import { TSecretImport } from "@app/hooks/api/types";

type Props = {
  onDelete: () => void;
  environment: string;
  secretPath?: string;
  secretImport?: TSecretImport;
  isReplicationExpand?: boolean;
  importedSecrets: {
    key: string;
    value?: string;
    overriden: { env: string; secretPath: string };
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
  const { currentWorkspace } = useWorkspace();
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
    try {
      await resyncSecretReplication.mutateAsync({
        id,
        environment,
        path: secretPath,
        projectId: currentWorkspace?.id || ""
      });
      createNotification({
        text: "Please refresh the dashboard to view changes",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to resync replication",
        type: "error"
      });
    }
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
        <div className="flex flex-grow items-center py-2 pl-4 pr-2">
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
              className="max-w-md whitespace-normal break-words"
              content={
                <div className="flex max-h-[10rem] flex-col overflow-auto">
                  <div className="flex self-start">
                    <FontAwesomeIcon icon={faCalendarCheck} className="pr-2 pt-0.5 text-sm" />
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
                        <FontAwesomeIcon icon={faXmark} className="pr-2 pt-1 text-sm" />
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
        <div className="flex items-center space-x-4 border-l border-mineshaft-600 px-4 py-2">
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
                <FontAwesomeIcon icon={faClose} size="lg" />
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
                    {/* <td style={{ padding: "0.25rem 1rem" }}>Override</td> */}
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
                  {filteredImportedSecrets.map(({ key, value }, index) => (
                    <tr key={`${id}-${key}-${index + 1}`}>
                      <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                        {key}
                      </td>
                      <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                        <SecretInput value={value} isReadOnly />
                      </td>
                      {/* <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          <EnvFolderIcon env={overriden?.env} secretPath={overriden?.secretPath} />
                        </td> */}
                    </tr>
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
