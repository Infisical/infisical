import { useState } from "react";
import { faBoxOpen, faEdit, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { GavelIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

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
import {
  ProjectPermissionActions,
  ProjectPermissionPamSessionActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { PAM_RESOURCE_TYPE_MAP, PamSessionStatus, TPamSession } from "@app/hooks/api/pam";

import { PamTerminateSessionModal } from "../../components/PamTerminateSessionModal";
import { PamSessionStatusBadge } from "./PamSessionStatusBadge";

type Props = {
  session: TPamSession;
};

export const PamSessionRow = ({ session }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [isTerminateDialogOpen, setIsTerminateDialogOpen] = useState(false);

  const {
    id,
    accountName,
    resourceType,
    resourceName,
    projectId,
    status,
    actorName,
    actorEmail,
    createdAt,
    endedAt,
    gatewayIdentityId,
    gatewayId
  } = session;

  const isActive = status === PamSessionStatus.Active || status === PamSessionStatus.Starting;
  const isGatewaySession = !!gatewayIdentityId || !!gatewayId;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  return (
    <>
      <Tr
        className={twMerge("group h-10 cursor-pointer hover:bg-bunker-400/20")}
        onClick={() =>
          navigate({
            to: "/organizations/$orgId/projects/pam/$projectId/sessions/$sessionId",
            params: { orgId: currentOrg.id, projectId, sessionId: id }
          })
        }
      >
        <Td>
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                alt={resourceTypeName}
                src={`/images/integrations/${image}`}
                className="size-6"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <span>{accountName}</span>
                <div className="flex items-center gap-1 text-xs text-bunker-300">
                  <FontAwesomeIcon icon={faBoxOpen} className="size-3" />
                  <span>{resourceName}</span>
                </div>
              </div>
            </div>
          </div>
        </Td>
        <Td>
          <div className="flex flex-col">
            <span>{actorName}</span>
            <span className="text-xs text-bunker-300">{actorEmail}</span>
          </div>
        </Td>
        <Td>
          <div className="flex flex-col">
            <span>{new Date(createdAt).toLocaleTimeString()}</span>
            <span className="text-xs text-bunker-300">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>
        </Td>
        <Td>
          {endedAt ? (
            <div className="flex flex-col">
              <span>{new Date(endedAt).toLocaleTimeString()}</span>
              <span className="text-xs text-bunker-300">
                {new Date(endedAt).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <span className="text-bunker-400">Ongoing</span>
          )}
        </Td>
        <Td>
          <div className="flex items-center justify-end gap-2">
            <PamSessionStatusBadge status={status} />
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
                    I={ProjectPermissionActions.Read}
                    a={ProjectPermissionSub.PamSessions}
                  >
                    {(isAllowed: boolean) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        icon={<FontAwesomeIcon icon={faEdit} />}
                        onClick={() =>
                          navigate({
                            to: "/organizations/$orgId/projects/pam/$projectId/sessions/$sessionId",
                            params: { orgId: currentOrg.id, projectId, sessionId: id }
                          })
                        }
                      >
                        View Session
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  {isGatewaySession && (
                    <ProjectPermissionCan
                      I={ProjectPermissionPamSessionActions.Terminate}
                      a={ProjectPermissionSub.PamSessions}
                    >
                      {(isAllowed: boolean) => (
                        <DropdownMenuItem
                          isDisabled={!isAllowed || !isActive}
                          className="text-red-600"
                          icon={<GavelIcon size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTerminateDialogOpen(true);
                          }}
                        >
                          Terminate Session
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>
          </div>
        </Td>
      </Tr>

      <PamTerminateSessionModal
        sessionId={id}
        projectId={projectId}
        isOpen={isTerminateDialogOpen}
        onOpenChange={setIsTerminateDialogOpen}
      />
    </>
  );
};
