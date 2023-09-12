import { useEffect } from "react";
import { subject } from "@casl/ability";
import { useSortable } from "@dnd-kit/sortable";
import {
  faFileImport,
  faFolder,
  faKey,
  faUpDown,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, IconButton, SecretInput, TableContainer, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";

type Props = {
  onDelete: (environment: string, secretPath: string) => void;
  environment: string;
  secretPath: string;
  importedEnv: string;
  importedSecPath: string;
  importedSecrets: { key: string; value: string; overriden: { env: string; secretPath: string } }[];
  searchTerm: string;
};

// to show the environment and folder icon
export const EnvFolderIcon = ({ env, secretPath }: { env: string; secretPath: string }) => (
  <div className="inline-flex items-center space-x-2">
    <div style={{ minWidth: "96px" }}>{env || "-"}</div>
    {secretPath && (
      <div className="inline-flex items-center space-x-2 border-l border-mineshaft-600 pl-2">
        <FontAwesomeIcon icon={faFolder} className="text-green-700 text-md" />
        <span>{secretPath}</span>
      </div>
    )}
  </div>
);

export const SecretImportItem = ({
  importedEnv,
  importedSecPath,
  onDelete,
  importedSecrets = [],
  searchTerm = "",
  secretPath,
  environment
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle();
  const { attributes, listeners, transform, transition, setNodeRef, isDragging } = useSortable({
    id: `${importedEnv}-${importedSecPath}`
  });
  const { currentWorkspace } = useWorkspace();
  const rowEnv = currentWorkspace?.environments?.find(({ slug }) => slug === importedEnv);

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

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className="group flex cursor-default flex-row items-center hover:bg-mineshaft-700"
        onClick={() => setIsExpanded.toggle()}
      >
        <td
          className={`ml-0.5 flex h-10 w-10 items-center justify-center border-none px-4 ${
            isExpanded && "border-t-2 border-mineshaft-500"
          }`}
        >
          <Tooltip content="Secret Import" className="capitalize">
            <FontAwesomeIcon icon={faFileImport} className="text-green-700" />
          </Tooltip>
        </td>
        <td
          colSpan={2}
          className="relative flex w-full min-w-[220px] items-center justify-between overflow-hidden text-ellipsis lg:min-w-[240px] xl:min-w-[280px]"
          style={{ paddingTop: "0", paddingBottom: "0" }}
        >
          <div className="flex-grow p-2">
            <EnvFolderIcon env={rowEnv?.name || ""} secretPath={importedSecPath} />
          </div>
          <div className="duration-0 flex h-10 w-16 items-center justify-end space-x-2.5 overflow-hidden border-l border-mineshaft-600 transition-all">
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Change Order" className="capitalize">
                <IconButton
                  size="md"
                  colorSchema="primary"
                  variant="plain"
                  ariaLabel="expand"
                  {...attributes}
                  {...listeners}
                >
                  <FontAwesomeIcon icon={faUpDown} size="lg" />
                </IconButton>
              </Tooltip>
            </div>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={subject(ProjectPermissionSub.SecretImports, { environment, secretPath })}
            >
              {(isAllowed) => (
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip content="Delete" className="capitalize">
                    <IconButton
                      size="md"
                      variant="plain"
                      colorSchema="danger"
                      ariaLabel="delete"
                      isDisabled={!isAllowed}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onDelete(importedEnv, importedSecPath);
                      }}
                    >
                      <FontAwesomeIcon icon={faXmark} size="lg" />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
          </div>
        </td>
      </tr>
      <tr>
        {isExpanded && !isDragging && (
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
                      <td style={{ padding: "0.25rem 1rem" }}>Override</td>
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
                    {importedSecrets
                      .filter((secret) =>
                        secret.key.toUpperCase().includes(searchTerm.toUpperCase())
                      )
                      .map(({ key, value, overriden }, index) => (
                        <tr key={`${importedEnv}-${importedSecPath}-${key}-${index + 1}`}>
                          <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                            {key}
                          </td>
                          <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                            <SecretInput value={value} isDisabled isVisible />
                          </td>
                          <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                            <EnvFolderIcon
                              env={overriden?.env}
                              secretPath={overriden?.secretPath}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableContainer>
            </div>
          </td>
        )}
      </tr>
    </>
  );
};
