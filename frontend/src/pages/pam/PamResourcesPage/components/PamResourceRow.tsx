import { faCheck, faCopy, faEdit, faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
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
import { Badge } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { PAM_RESOURCE_TYPE_MAP, TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
  onUpdate: (resource: TPamResource) => void;
  onDelete: (resource: TPamResource) => void;
  search: string;
};

export const PamResourceRow = ({ resource, onUpdate, onDelete, search }: Props) => {
  const navigate = useNavigate();

  const { id, name, resourceType, projectId } = resource;
  const { currentOrg } = useOrganization();

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = () => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Resource ID copied to clipboard",
      type: "info"
    });

    setTimeout(() => setIsIdCopied.off(), 2000);
  };

  return (
    <Tr
      className="group h-10 cursor-pointer hover:bg-mineshaft-700"
      onClick={() =>
        navigate({
          to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
          params: {
            orgId: currentOrg.id,
            projectId,
            resourceType,
            resourceId: id
          }
        })
      }
    >
      <Td>
        <div className="flex items-center gap-4">
          <div className="relative">
            <img alt={resourceTypeName} src={`/images/integrations/${image}`} className="size-5" />
          </div>
          <span>
            <HighlightText text={name} highlight={search} />
          </span>
          <Badge variant="neutral">
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
                onClick={(e) => e.stopPropagation()}
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                Copy Resource ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate(resource);
                    }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(resource);
                    }}
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
