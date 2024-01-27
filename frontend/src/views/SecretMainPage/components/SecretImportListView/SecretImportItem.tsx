import { useEffect } from "react";
import { subject } from "@casl/ability";
import { useSortable } from "@dnd-kit/sortable";
import {
  faClose,
  faFileImport,
  faFolder,
  faKey,
  faUpDown
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, IconButton, SecretInput, TableContainer } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

type Props = {
  onDelete: () => void;
  environment: string;
  secretPath?: string;
  importEnvName: string;
  importEnvPath: string;
  importedSecrets: { key: string; value: string; overriden: { env: string; secretPath: string } }[];
  searchTerm: string;
  id: string;
};

// to show the environment and folder icon
export const EnvFolderIcon = ({ env, secretPath }: { env: string; secretPath: string }) => (
  <div className="inline-flex items-center space-x-2">
    <div style={{ minWidth: "96px" }}>{env || "-"}</div>
    {secretPath && (
      <div className="inline-flex items-center space-x-2 border-l border-mineshaft-600 pl-2">
        <FontAwesomeIcon icon={faFolder} className="text-md text-green-700" />
        <span>{secretPath}</span>
      </div>
    )}
  </div>
);

export const SecretImportItem = ({
  onDelete,
  id,
  importEnvName,
  importEnvPath,
  importedSecrets = [],
  searchTerm = "",
  secretPath,
  environment
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle();
  const { attributes, listeners, transform, transition, setNodeRef, isDragging } = useSortable({
    id
  });

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
      <div
        className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
        role="button"
        ref={setNodeRef}
        tabIndex={0}
        style={style}
        onClick={() => setIsExpanded.toggle()}
        onKeyDown={() => setIsExpanded.toggle()}
      >
        <div className="flex w-12 items-center px-4 py-2 text-green-700">
          <FontAwesomeIcon icon={faFileImport} />
        </div>
        <div className="flex flex-grow items-center px-4 py-2">
          <EnvFolderIcon env={importEnvName || ""} secretPath={importEnvPath} />
        </div>
        <div className="flex items-center space-x-4 border-l border-mineshaft-600 px-4 py-2">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
                    .filter((secret) => secret.key.toUpperCase().includes(searchTerm.toUpperCase()))
                    .map(({ key, value, overriden }, index) => (
                      <tr key={`${id}-${key}-${index + 1}`}>
                        <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          {key}
                        </td>
                        <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          <SecretInput value={value} isReadOnly />
                        </td>
                        <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          <EnvFolderIcon env={overriden?.env} secretPath={overriden?.secretPath} />
                        </td>
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
