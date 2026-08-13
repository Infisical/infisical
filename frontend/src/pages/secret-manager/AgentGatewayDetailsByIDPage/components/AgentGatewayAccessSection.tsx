import { useEffect, useMemo, useState } from "react";
import { PlusIcon, SearchIcon, ShieldIcon, UserIcon, UsersIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  AgentGatewayPrincipalKind,
  TAgentGateway,
  useGetAgentGatewayAccess,
  useGrantAgentGatewayAccess,
  useRevokeAgentGatewayAccess
} from "@app/hooks/api/agentGateways";
import { useListProjectIdentityMemberships } from "@app/hooks/api/projectIdentityMembership/queries";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api/projects/queries";

type Props = {
  agentGateway: TAgentGateway;
};

const KIND_META: Record<AgentGatewayPrincipalKind, { label: string; icon: typeof UserIcon }> = {
  [AgentGatewayPrincipalKind.User]: { label: "User", icon: UserIcon },
  [AgentGatewayPrincipalKind.Identity]: { label: "Machine Identity", icon: ShieldIcon },
  [AgentGatewayPrincipalKind.Group]: { label: "Group", icon: UsersIcon }
};

type TPrincipal = {
  kind: AgentGatewayPrincipalKind;
  principalId: string;
  name: string;
  subtitle: string;
};

const principalKey = (principal: Pick<TPrincipal, "kind" | "principalId">) =>
  `${principal.kind}:${principal.principalId}`;

// Rows live in one bordered list rather than a stack of cards, so a short access list reads as a group
// instead of as scattered boxes.
const PrincipalList = ({ children }: { children: React.ReactNode }) => (
  <div className="divide-y divide-mineshaft-600 overflow-hidden rounded border border-mineshaft-600">
    {children}
  </div>
);

// Two lines rather than one: this card lives in the narrow column, where a name, a subtitle and a badge on a
// single row would all be truncated into uselessness. The kind moves into the muted line, so the badge goes.
const PrincipalRow = ({
  principal,
  action
}: {
  principal: TPrincipal;
  action?: React.ReactNode;
}) => {
  const meta = KIND_META[principal.kind];
  const Icon = meta.icon;
  const detail =
    principal.subtitle === meta.label ? meta.label : `${meta.label} · ${principal.subtitle}`;

  return (
    <div className="flex items-center gap-x-3 px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-mineshaft-700 text-mineshaft-300">
        <Icon size={14} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-mineshaft-100">{principal.name}</span>
        <span className="truncate text-xs text-mineshaft-400">{detail}</span>
      </span>
      {action}
    </div>
  );
};

export const AgentGatewayAccessSection = ({ agentGateway }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["grantAccess"] as const);
  const { data: access = [] } = useGetAgentGatewayAccess(agentGateway.id);
  const grantAccess = useGrantAgentGatewayAccess();
  const revokeAccess = useRevokeAgentGatewayAccess();

  const [search, setSearch] = useState("");
  // Staged, so the sheet's Cancel means something. Diffed against the server list on save.
  const [selected, setSelected] = useState<TPrincipal[]>([]);
  const { data: members } = useGetWorkspaceUsers(agentGateway.projectId);
  const { data: identities } = useListProjectIdentityMemberships({
    projectId: agentGateway.projectId
  });
  const { data: groups } = useListWorkspaceGroups(agentGateway.projectId);

  // Only principals already in the project are offered: granting access to someone outside it would create
  // a grant that silently does nothing, which the API rejects anyway.
  const candidates = useMemo<TPrincipal[]>(
    () => [
      ...(members ?? []).map((m) => ({
        kind: AgentGatewayPrincipalKind.User,
        principalId: m.user.id,
        name:
          [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") ||
          m.user.username ||
          m.user.email,
        subtitle: m.user.email ?? "User"
      })),
      ...(identities?.identityMemberships ?? []).map((m) => ({
        kind: AgentGatewayPrincipalKind.Identity,
        principalId: m.identity.id,
        name: m.identity.name,
        subtitle: "Machine identity"
      })),
      ...(groups ?? []).map((g) => ({
        kind: AgentGatewayPrincipalKind.Group,
        principalId: g.group.id,
        name: g.group.name,
        subtitle: "Group"
      }))
    ],
    [members, identities, groups]
  );

  const grantedPrincipals = useMemo<TPrincipal[]>(() => {
    const candidateByKey = new Map(
      candidates.map((candidate) => [principalKey(candidate), candidate])
    );
    return access.map((entry) => {
      // The candidate lists carry richer subtitles, so prefer them and fall back to what the grant stored.
      const candidate = candidateByKey.get(principalKey(entry));
      return {
        kind: entry.kind,
        principalId: entry.principalId,
        name: candidate?.name || entry.name,
        subtitle: candidate?.subtitle || entry.email || KIND_META[entry.kind].label
      };
    });
  }, [access, candidates]);

  // Reseeded whenever the sheet opens, so it starts from what is actually granted rather than a stale draft.
  useEffect(() => {
    if (!popUp.grantAccess.isOpen) return;
    setSelected(grantedPrincipals);
    setSearch("");
  }, [popUp.grantAccess.isOpen]);

  const selectedKeys = new Set(selected.map(principalKey));
  const results = search
    ? candidates
        .filter(
          (candidate) =>
            !selectedKeys.has(principalKey(candidate)) &&
            (candidate.name.toLowerCase().includes(search.toLowerCase()) ||
              candidate.subtitle.toLowerCase().includes(search.toLowerCase()))
        )
        .slice(0, 8)
    : [];

  const onSave = async () => {
    const grantedKeys = new Set(grantedPrincipals.map(principalKey));
    const added = selected.filter((principal) => !grantedKeys.has(principalKey(principal)));
    const removed = grantedPrincipals.filter(
      (principal) => !selectedKeys.has(principalKey(principal))
    );

    try {
      await Promise.all([
        ...added.map((principal) =>
          grantAccess.mutateAsync({
            agentGatewayId: agentGateway.id,
            kind: principal.kind,
            principalId: principal.principalId
          })
        ),
        ...removed.map((principal) =>
          revokeAccess.mutateAsync({
            agentGatewayId: agentGateway.id,
            kind: principal.kind,
            principalId: principal.principalId
          })
        )
      ]);
      handlePopUpToggle("grantAccess", false);
    } catch {
      createNotification({ text: "Failed to update access", type: "error" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Access Control</CardTitle>
          <CardDescription>
            Users, machine identities, and groups allowed to send requests through this gateway.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-y-3">
          {/* Below the description rather than beside it: this card lives in the narrow column, where a header
              action steals the width the description needs. */}
          <ProjectPermissionCan
            I={ProjectPermissionAgentGatewayActions.ManageAccess}
            a={ProjectPermissionSub.AgentGateways}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                className="w-full"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("grantAccess")}
              >
                <PlusIcon />
                Grant Access
              </Button>
            )}
          </ProjectPermissionCan>
          {!grantedPrincipals.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>No access granted</EmptyTitle>
                <EmptyDescription>
                  Grant users, identities, or groups access to use this gateway.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <PrincipalList>
              {grantedPrincipals.map((principal) => (
                <PrincipalRow
                  key={principalKey(principal)}
                  principal={principal}
                  action={
                    <ProjectPermissionCan
                      I={ProjectPermissionAgentGatewayActions.ManageAccess}
                      a={ProjectPermissionSub.AgentGateways}
                    >
                      {(isAllowed) => (
                        <IconButton
                          aria-label={`Revoke access for ${principal.name}`}
                          variant="ghost"
                          size="xs"
                          isDisabled={!isAllowed}
                          onClick={() =>
                            revokeAccess.mutate({
                              agentGatewayId: agentGateway.id,
                              kind: principal.kind,
                              principalId: principal.principalId
                            })
                          }
                        >
                          <XIcon />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  }
                />
              ))}
            </PrincipalList>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={popUp.grantAccess.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("grantAccess", isOpen)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Grant Access</SheetTitle>
            <p className="text-sm text-mineshaft-300">
              Select who can send requests through this gateway.
            </p>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-y-4 overflow-y-auto p-4">
            {/* Search is how a principal is added. Results only appear while searching, so the list below
                stays a statement of who has access rather than a picker to scroll. */}
            <div className="relative">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users, machine identities & groups"
                />
              </InputGroup>
              {Boolean(search) && (
                <div className="absolute z-10 mt-1 flex w-full flex-col gap-y-1 rounded border border-mineshaft-600 bg-mineshaft-800 p-1 shadow-lg">
                  {results.map((candidate) => {
                    const Icon = KIND_META[candidate.kind].icon;
                    return (
                      <button
                        type="button"
                        key={principalKey(candidate)}
                        className="flex items-center gap-x-3 rounded px-2 py-2 text-left hover:bg-mineshaft-700"
                        onClick={() => {
                          setSelected((prev) => [...prev, candidate]);
                          setSearch("");
                        }}
                      >
                        <Icon size={14} className="text-mineshaft-400" />
                        <span className="min-w-0 flex-1 truncate text-sm text-mineshaft-100">
                          {candidate.name}
                        </span>
                        <span className="text-xs text-mineshaft-400">
                          {KIND_META[candidate.kind].label}
                        </span>
                      </button>
                    );
                  })}
                  {!results.length && (
                    <p className="px-2 py-2 text-sm text-mineshaft-400">
                      Nobody in this project matches, or they already have access.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-y-2">
              <p className="text-xs tracking-wider text-mineshaft-400 uppercase">Access</p>
              {selected.length ? (
                <PrincipalList>
                  {selected.map((principal) => (
                    <PrincipalRow
                      key={principalKey(principal)}
                      principal={principal}
                      action={
                        <IconButton
                          aria-label={`Remove ${principal.name}`}
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setSelected((prev) =>
                              prev.filter((p) => principalKey(p) !== principalKey(principal))
                            )
                          }
                        >
                          <XIcon />
                        </IconButton>
                      }
                    />
                  ))}
                </PrincipalList>
              ) : (
                <p className="rounded border border-dashed border-mineshaft-600 px-3 py-6 text-center text-sm text-mineshaft-400">
                  Nobody has access yet. Search above to add someone.
                </p>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => handlePopUpToggle("grantAccess", false)}>
              Cancel
            </Button>
            <Button
              variant="project"
              onClick={onSave}
              isPending={grantAccess.isPending || revokeAccess.isPending}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
