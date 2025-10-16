import { faEdit, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
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
import { PAM_RESOURCE_TYPE_MAP, TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
  onUpdate: (resource: TPamResource) => void;
  onDelete: (resource: TPamResource) => void;
  search: string;
};

export const PamResourceRow = ({ resource, onUpdate, onDelete, search }: Props) => {
  const { name, resourceType } = resource;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  return (
    <Tr className={twMerge("group h-10")}>
      <Td>
        <div className="flex items-center gap-4">
          <div className="relative">
            <img alt={resourceTypeName} src={`/images/integrations/${image}`} className="size-5" />
          </div>
          <span>
            <HighlightText text={name} highlight={search} />
          </span>
          <Badge className="flex h-5 w-min items-center gap-1.5 bg-mineshaft-400/50 whitespace-nowrap text-bunker-300">
            <span>
              <HighlightText text={resourceTypeName} highlight={search} />
            </span>
          </Badge>
        </div>
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={() => onUpdate(resource)}
                  >
                    Edit Resource
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={() => onDelete(resource)}
                  >
                    Delete Resource
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
