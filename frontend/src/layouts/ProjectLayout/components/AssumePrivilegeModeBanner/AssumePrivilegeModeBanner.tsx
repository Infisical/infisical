import { faIdCard, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";

export const AssumePrivilegeModeBanner = () => {
  const { currentWorkspace } = useWorkspace();
  const exitAssumePrivilegeMode = useRemoveAssumeProjectPrivilege();
  const { impersonation } = useProjectPermission();

  if (!impersonation) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded border border-mineshaft-600 bg-mineshaft-800 p-2 shadow">
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild>
          <Button
            leftIcon={
              <FontAwesomeIcon
                icon={impersonation?.actorType === ActorType.USER ? faUser : faIdCard}
              />
            }
            onClick={() => {
              exitAssumePrivilegeMode.mutate(
                {
                  projectId: currentWorkspace.id
                },
                {
                  onSuccess: () => {
                    window.location.href = `/${currentWorkspace.type}/${currentWorkspace.id}/overview`;
                  }
                }
              );
            }}
          >
            Exit Assume Privilege Mode
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          className="bg-mineshaft-800 pt-4"
          sideOffset={10}
          style={{ width: "360px" }}
        >
          <div className="flex gap-2">
            <div className="flex px-2 pt-2">
              <FontAwesomeIcon
                className="text-3xl text-mineshaft-400"
                icon={impersonation?.actorType === ActorType.USER ? faUser : faIdCard}
              />
            </div>
            <div className="mb-4">
              <div className="text-lg">{impersonation?.actorName}</div>
              {impersonation?.actorEmail && (
                <div className="text-xs">{impersonation?.actorEmail}</div>
              )}
              {impersonation?.actorType === ActorType.IDENTITY && (
                <div className="text-xs">{impersonation?.actorId}</div>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
};
