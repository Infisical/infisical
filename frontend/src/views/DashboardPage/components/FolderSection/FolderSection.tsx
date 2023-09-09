import { memo } from "react";
import { subject } from "@casl/ability";
import { faEdit, faFolder, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

type Props = {
  folders?: Array<{ id: string; name: string }>;
  search?: string;
  environment: string;
  secretPath: string;
  onFolderUpdate: (folderId: string, name: string) => void;
  onFolderDelete: (folderId: string, name: string) => void;
  onFolderOpen: (folderId: string) => void;
};

export const FolderSection = memo(
  ({
    onFolderUpdate: handleFolderUpdate,
    onFolderDelete: handleFolderDelete,
    onFolderOpen: handleFolderOpen,
    search = "",
    folders = [],
    environment,
    secretPath
  }: Props) => {
    return (
      <>
        {folders
          .filter(({ name }) => name.toLowerCase().includes(search.toLowerCase()))
          .map(({ id, name }) => (
            <tr
              key={id}
              className="group flex cursor-default flex-row items-center hover:bg-mineshaft-700"
            >
              <td className="ml-0.5 flex h-10 w-10 items-center justify-center border-none px-4">
                <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
              </td>
              <td
                colSpan={2}
                className="relative flex w-full min-w-[220px] items-center justify-between overflow-hidden text-ellipsis lg:min-w-[240px] xl:min-w-[280px]"
                style={{ paddingTop: "0", paddingBottom: "0" }}
              >
                <div
                  className="flex-grow cursor-default p-2"
                  onKeyDown={() => null}
                  tabIndex={0}
                  role="button"
                  onClick={() => handleFolderOpen(id)}
                >
                  {name}
                </div>
                <div className="duration-0 flex h-10 w-16 items-center justify-end space-x-2.5 overflow-hidden border-l border-mineshaft-600 transition-all">
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Folders, { environment, secretPath })}
                  >
                    {(isAllowed) => (
                      <div className="opacity-0 group-hover:opacity-100">
                        <Tooltip content="Settings" className="capitalize">
                          <IconButton
                            size="md"
                            colorSchema="primary"
                            variant="plain"
                            isDisabled={!isAllowed}
                            onClick={() => handleFolderUpdate(id, name)}
                            ariaLabel="expand"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={subject(ProjectPermissionSub.Folders, { environment, secretPath })}
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
                            onClick={() => handleFolderDelete(id, name)}
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
          ))}
      </>
    );
  }
);

FolderSection.displayName = "FolderSection";
