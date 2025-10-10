import { useState } from "react";
import {
  faBoxOpen,
  faChevronDown,
  faChevronUp,
  faEdit,
  faEllipsisV,
  faTerminal
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
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
import { PAM_RESOURCE_TYPE_MAP, TPamSession } from "@app/hooks/api/pam";

import { PamSessionStatusBadge } from "./PamSessionStatusBadge";

type Props = {
  session: TPamSession;
  search: string;
  filteredCommandLogs: TPamSession["commandLogs"];
};

export const PamSessionRow = ({ session, search, filteredCommandLogs }: Props) => {
  const router = useRouter();
  const [showAllLogs, setShowAllLogs] = useState(false);

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
    endedAt
  } = session;

  const { image, name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  const LOGS_TO_SHOW = 5;
  const logsToShow = showAllLogs ? filteredCommandLogs : filteredCommandLogs.slice(0, LOGS_TO_SHOW);

  return (
    <>
      <Tr
        className={twMerge("hover:bg-bunker-400/20 group h-10 cursor-pointer")}
        onClick={() => router.history.push(`/projects/pam/${projectId}/sessions/${id}`)}
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
                <span>
                  <HighlightText text={accountName} highlight={search} />
                </span>
                <div className="text-bunker-300 flex items-center gap-1 text-xs">
                  <FontAwesomeIcon icon={faBoxOpen} className="size-3" />
                  <span>
                    <HighlightText text={resourceName} highlight={search} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Td>
        <Td>
          <div className="flex flex-col">
            <span>
              <HighlightText text={actorName} highlight={search} />
            </span>
            <span className="text-bunker-300 text-xs">
              <HighlightText text={actorEmail} highlight={search} />
            </span>
          </div>
        </Td>
        <Td>
          <div className="flex flex-col">
            <span>{new Date(createdAt).toLocaleTimeString()}</span>
            <span className="text-bunker-300 text-xs">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>
        </Td>
        <Td>
          {endedAt ? (
            <div className="flex flex-col">
              <span>{new Date(endedAt).toLocaleTimeString()}</span>
              <span className="text-bunker-300 text-xs">
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
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.PamResources}
                  >
                    {(isAllowed: boolean) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        icon={<FontAwesomeIcon icon={faEdit} />}
                        onClick={() =>
                          router.history.push(`/projects/pam/${projectId}/sessions/${id}`)
                        }
                      >
                        View Session
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>
          </div>
        </Td>
      </Tr>

      {filteredCommandLogs.length > 0 && (
        <Tr>
          <Td colSpan={5} className="py-3 text-xs">
            {logsToShow.map((log) => (
              <div key={`${id}-log-${log.timestamp}`} className="mb-4 flex flex-col last:mb-0">
                <div className="text-bunker-400 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faTerminal} className="size-3" />
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>

                <div className="font-mono">
                  <HighlightText text={log.input.trim()} highlight={search} />
                </div>
                <div className="text-bunker-300 font-mono">
                  <HighlightText text={log.output.trim()} highlight={search} />
                </div>
              </div>
            ))}
            {filteredCommandLogs.length > LOGS_TO_SHOW && (
              <div className="mt-2">
                <Button
                  variant="link"
                  size="xs"
                  leftIcon={<FontAwesomeIcon icon={showAllLogs ? faChevronUp : faChevronDown} />}
                  onClick={() => setShowAllLogs(!showAllLogs)}
                  className="text-mineshaft-300 hover:text-primary p-0"
                >
                  {showAllLogs
                    ? "Show less"
                    : `Show ${filteredCommandLogs.length - LOGS_TO_SHOW} more log${filteredCommandLogs.length - LOGS_TO_SHOW === 1 ? "" : "s"}`}
                </Button>
              </div>
            )}
          </Td>
        </Tr>
      )}
    </>
  );
};
