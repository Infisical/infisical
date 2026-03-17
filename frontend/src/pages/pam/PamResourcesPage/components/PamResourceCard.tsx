import { faCheck, faCopy, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { EllipsisIcon, StarIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { Badge, UnstableIconButton } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { PAM_RESOURCE_TYPE_MAP, TPamResource } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
  onUpdate: (resource: TPamResource) => void;
  onDelete: (resource: TPamResource) => void;
  onToggleFavorite: (resource: TPamResource) => void;
  search: string;
};

export const PamResourceCard = ({
  resource,
  onUpdate,
  onDelete,
  onToggleFavorite,
  search
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { id, name, resourceType, projectId } = resource;
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

  const handleNavigate = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
      params: {
        orgId: currentOrg.id,
        projectId,
        resourceType,
        resourceId: id
      }
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex cursor-pointer flex-col overflow-clip rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-4 text-start transition-transform duration-100 hover:border-primary/60"
      onClick={handleNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleNavigate();
      }}
    >
      <div className="flex items-center gap-3.5">
        <img
          alt={resourceTypeName}
          src={`/images/integrations/${image}`}
          className="size-10 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-lg font-medium text-mineshaft-100">
              <HighlightText text={name} highlight={search} />
            </p>
            <div className="flex items-center gap-0.5">
              <UnstableIconButton
                size="xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(resource);
                }}
              >
                <StarIcon
                  className={resource.isFavorite ? "text-yellow-600" : "text-mineshaft-400"}
                  fill={resource.isFavorite ? "currentColor" : "none"}
                  size={14}
                />
              </UnstableIconButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <UnstableIconButton
                    size="xs"
                    variant="ghost"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisIcon />
                  </UnstableIconButton>
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
            </div>
          </div>
          <Badge variant="neutral" className="mt-1">
            {resourceTypeName}
          </Badge>
        </div>
      </div>
    </div>
  );
};
