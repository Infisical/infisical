import { useState } from "react";
import { GlobeIcon, PlusIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Input
} from "@app/components/v3";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useUpdateAgentGateway } from "@app/hooks/api/agentGateways";
import { AgentGatewayUnmatchedHostPolicy, TAgentGateway } from "@app/hooks/api/agentGateways/types";

type Props = {
  agentGateway: TAgentGateway;
};

export const AgentGatewayAllowedHostsSection = ({ agentGateway }: Props) => {
  const { mutateAsync: updateAgentGateway, isPending } = useUpdateAgentGateway();
  const [host, setHost] = useState("");

  const hosts = agentGateway.allowedHosts ?? [];
  const isBlocking = agentGateway.unmatchedHostPolicy === AgentGatewayUnmatchedHostPolicy.Block;

  const save = async (nextHosts: string[]) => {
    await updateAgentGateway({ agentGatewayId: agentGateway.id, allowedHosts: nextHosts });
  };

  const onAdd = async () => {
    const candidate = host.trim().toLowerCase();
    if (!candidate) return;
    if (hosts.includes(candidate)) {
      setHost("");
      return;
    }

    try {
      await save([...hosts, candidate]);
      setHost("");
      createNotification({
        text: `${candidate} can now be reached without a credential`,
        type: "success"
      });
    } catch {
      // The mutation cache reports the server's message; keep the typed value so it can be corrected.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allowed Hosts</CardTitle>
        <CardDescription>
          Hosts an agent may reach with no credential applied, even while unmatched hosts are
          blocked.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionAgentGatewayActions.Edit}
            a={ProjectPermissionSub.AgentGateways}
          >
            {(isAllowed) => (
              <div className="flex items-center gap-x-2">
                <Input
                  className="h-9 w-64"
                  placeholder="www.google.com"
                  value={host}
                  disabled={!isAllowed}
                  onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAdd();
                    }
                  }}
                />
                <Button
                  variant="project"
                  className="shrink-0"
                  isDisabled={!isAllowed || !host.trim()}
                  isPending={isPending}
                  onClick={() => onAdd()}
                >
                  <PlusIcon />
                  Allow
                </Button>
              </div>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-y-3">
        {/* Said once, here: with the policy on allow the list changes nothing, and someone adding hosts to it
            deserves to know that rather than wonder why it had no effect. */}
        {!isBlocking && (
          <p className="text-xs text-mineshaft-400">
            Unmatched hosts are currently allowed, so this list has no effect. Set unmatched hosts
            to Blocked to make it the allow list.
          </p>
        )}
        {!hosts.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GlobeIcon />
              </EmptyMedia>
              <EmptyTitle>No allowed hosts</EmptyTitle>
              <EmptyDescription>
                Add a host here, or allow one straight from a blocked request in a session
                recording.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-mineshaft-600 overflow-hidden rounded border border-mineshaft-600">
            {hosts.map((allowedHost) => (
              <div key={allowedHost} className="flex items-center gap-x-3 px-3 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded bg-mineshaft-700 text-mineshaft-300">
                  <GlobeIcon size={14} />
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-mineshaft-100">
                  {allowedHost}
                </code>
                <Badge variant="neutral">No credential</Badge>
                <ProjectPermissionCan
                  I={ProjectPermissionAgentGatewayActions.Edit}
                  a={ProjectPermissionSub.AgentGateways}
                >
                  {(isAllowed) => (
                    <IconButton
                      aria-label={`Stop allowing ${allowedHost}`}
                      variant="ghost"
                      size="xs"
                      isDisabled={!isAllowed}
                      onClick={() => save(hosts.filter((h) => h !== allowedHost))}
                    >
                      <XIcon />
                    </IconButton>
                  )}
                </ProjectPermissionCan>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
