import { faEdit, faEllipsisV, faFolder, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TPamFolder } from "@app/hooks/api/pam";

type Props = {
  folder: TPamFolder;
  onUpdate: (folder: TPamFolder) => void;
  onDelete: (folder: TPamFolder) => void;
  onClick: () => void;
  search: string;
};

export const PamFolderRow = ({ folder, onClick, onDelete, onUpdate, search }: Props) => {
  return (
    <Tr
      className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
      onClick={onClick}
    >
      <Td>
        <div className="flex items-center gap-4">
          <div className="flex w-5 justify-center">
            <FontAwesomeIcon icon={faFolder} className="size-4 text-yellow-700" />
          </div>
          <span>
            <HighlightText text={folder.name} highlight={search} />
          </span>
        </div>
      </Td>
      <Td>
        <div className="flex h-[22px] justify-end">
          <Tooltip className="max-w-sm text-center" content="Options">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  ariaLabel="Options"
                  colorSchema="secondary"
                  className="hidden w-6 group-hover:flex data-[state=open]:!flex"
                  variant="plain"
                >
                  <FontAwesomeIcon icon={faEllipsisV} />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent sideOffset={2} align="end">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.PamFolders}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faEdit} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate(folder);
                      }}
                    >
                      Edit Folder
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.PamFolders}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      icon={<FontAwesomeIcon icon={faTrash} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(folder);
                      }}
                    >
                      Delete Folder
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
