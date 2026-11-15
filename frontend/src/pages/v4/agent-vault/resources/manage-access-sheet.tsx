import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Heading, Meta } from "@infisical/cipher/ui/text";

import { actorIdsPayload } from "@app/helpers/agentVaultMembers";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultMember, TAgentVaultProductActor } from "@app/hooks/api/agentVault/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  AgentVaultDocs,
  MEMBER_KIND,
  memberDisplayName,
  memberSubtitle
} from "./agent-vault-utils";
import { DateCell } from "./shared";

const PER_PAGE = 20;
const AVAILABLE_PREVIEW_LIMIT = 20;
const ALL = "all";

type TActor = TAgentVaultMember | TAgentVaultProductActor;

const memberKey = (member: TActor) => `${member.type}:${member.id}`;

const MemberCell = ({ member }: { member: TActor }) => (
  <Inline gap={8} align="center" wrap={false}>
    <Icon icon={MEMBER_KIND[member.type].icon} />
    <Stack gap={0} style={{ minWidth: 0 }}>
      <span title={memberDisplayName(member)}>{memberDisplayName(member)}</span>
      <Meta mono={false}>{memberSubtitle(member)}</Meta>
    </Stack>
  </Inline>
);

const ManageAccessContent = ({
  projectId,
  accessBundle
}: {
  projectId: string;
  accessBundle: { id: string; name: string };
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<AgentVaultMemberType | typeof ALL>(ALL);
  const [revoking, setRevoking] = useState<TAgentVaultMember>();
  const searchParam = debouncedSearch.trim() || undefined;
  const actorType = type === ALL ? undefined : type;

  const { data, isPending } = resources.useAccessBundleMembers(projectId, accessBundle.id, {
    actorType,
    search: searchParam,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE
  });
  const { data: available, isPending: isAvailablePending } =
    resources.useAvailableAccessBundleMembers(
      projectId,
      accessBundle.id,
      { actorType, search: searchParam, limit: AVAILABLE_PREVIEW_LIMIT },
      true
    );
  const addMembers = resources.useAddAccessBundleMembers(projectId);
  const revokeMembers = resources.useRevokeAccessBundleMembers(projectId);

  const members = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  const candidates = available?.members ?? [];
  const candidateCount = available?.totalCount ?? 0;
  const typeLabel = type === ALL ? "members" : `${MEMBER_KIND[type].label.toLowerCase()}s`;

  const grant = async (member: TAgentVaultProductActor) => {
    const name = memberDisplayName(member);
    try {
      const { members: granted } = await addMembers.mutateAsync({
        accessBundleId: accessBundle.id,
        ...actorIdsPayload([member])
      });
      if (granted.length) saved(`Granted ${name} access to ${accessBundle.name}`);
      else
        toast({
          tone: "neutral",
          title: `${name} already has this access bundle`
        });
    } catch (error) {
      failed(`Failed to grant ${name} access`, error);
    }
  };

  const revokeActions: DataTableRowActions<TAgentVaultMember> = {
    renderMenu: (member) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={revokeMembers.isPending}
        onSelect={() => setRevoking(member)}
      >
        <Icon name="x" />
        Revoke access
      </DropdownMenuItem>
    )
  };

  const memberColumns: DataTableColumn<TAgentVaultMember>[] = [
    {
      id: "member",
      header: "Member",
      grow: true,
      text: memberDisplayName,
      render: (member) => <MemberCell member={member} />
    },
    {
      id: "granted",
      header: "Granted",
      width: 128,
      render: (member) => <DateCell value={member.grantedAt} />
    }
  ];

  const candidateColumns: DataTableColumn<TAgentVaultProductActor>[] = [
    {
      id: "member",
      header: "Member",
      grow: true,
      text: memberDisplayName,
      render: (member) => <MemberCell member={member} />
    },
    {
      id: "grant",
      header: "Grant access",
      hideHeader: true,
      align: "end",
      width: 128,
      render: (member) => (
        <Button
          variant="outline"
          size="sm"
          disabled={addMembers.isPending}
          aria-label={`Grant access to ${memberDisplayName(member)}`}
          onClick={() => grant(member)}
        >
          Grant access
        </Button>
      )
    }
  ];

  let noCandidates = "Everyone in this project already has this bundle.";
  if (searchParam) noCandidates = `No ${typeLabel} without access match your search.`;
  else if (type !== ALL) noCandidates = `No ${typeLabel} without access.`;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Manage access</SheetTitle>
        <SheetDescription>
          {`Who can create sessions with ${accessBundle.name}.`}{" "}
          <DocumentationLink href={AgentVaultDocs.accessBundles} subject="access bundles" />
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          <Inline gap={8} wrap={false}>
            <Input
              icon="search"
              aria-label="Search members"
              placeholder="Search users, groups, and machine identities..."
              value={search}
              maxLength={255}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              label="Member type"
              value={type}
              options={[
                { value: ALL, label: "All types" },
                { value: AgentVaultMemberType.User, label: "Users" },
                { value: AgentVaultMemberType.Group, label: "Groups" },
                {
                  value: AgentVaultMemberType.MachineIdentity,
                  label: "Machine identities"
                }
              ]}
              onChange={(next) => {
                setType(next as AgentVaultMemberType | typeof ALL);
                setPage(1);
              }}
            />
          </Inline>
          <Stack gap={8}>
            <Heading level={3} size="subsection">
              Has access
            </Heading>
            <DataTable
              label={`Members with access to ${accessBundle.name}`}
              rows={members}
              columns={memberColumns}
              getRowId={memberKey}
              rowLabel={memberDisplayName}
              loading={isPending}
              loadingRows={3}
              rowActions={revokeActions}
              empty={
                <EmptyState
                  size="sm"
                  media="bare"
                  icon={searchParam ? "search" : "users"}
                  title={
                    searchParam || type !== ALL
                      ? `No ${typeLabel} with access match`
                      : "No one has access yet"
                  }
                />
              }
              pagination={
                totalCount > PER_PAGE ? (
                  <Pagination
                    label="Members with access pages"
                    variant="compact"
                    page={page}
                    total={totalCount}
                    pageSize={PER_PAGE}
                    onPageChange={setPage}
                  />
                ) : undefined
              }
            />
          </Stack>
          <Stack gap={8}>
            <Heading level={3} size="subsection">
              No access
            </Heading>
            <DataTable
              label={`Members without access to ${accessBundle.name}`}
              rows={candidates}
              columns={candidateColumns}
              getRowId={memberKey}
              rowLabel={memberDisplayName}
              loading={isAvailablePending}
              loadingRows={2}
              empty={<EmptyState size="sm" media="bare" icon="users" title={noCandidates} />}
              end={
                candidateCount > candidates.length ? (
                  <Meta mono={false}>
                    {`Showing the first ${AVAILABLE_PREVIEW_LIMIT} of ${candidateCount}. Search to find someone else.`}
                  </Meta>
                ) : undefined
              }
            />
          </Stack>
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Meta mono={false}>Changes save automatically</Meta>
      </SheetFooter>
      <AlertDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(undefined)}
      >
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Revoke access for ${revoking ? memberDisplayName(revoking) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any active session they hold stops reaching its hosts at the next proxy poll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!revoking) return;
                const name = memberDisplayName(revoking);
                try {
                  await revokeMembers.mutateAsync({
                    accessBundleId: accessBundle.id,
                    ...actorIdsPayload([revoking])
                  });
                  saved(`Revoked ${name} from ${accessBundle.name}`);
                } catch (error) {
                  failed(`Failed to revoke ${name}`, error);
                }
                setRevoking(undefined);
              }}
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const ManageAccessSheet = ({
  projectId,
  accessBundle,
  onOpenChange
}: {
  projectId: string;
  accessBundle?: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
    <SheetContent size="lg">
      {accessBundle && (
        <ManageAccessContent
          key={accessBundle.id}
          projectId={projectId}
          accessBundle={accessBundle}
        />
      )}
    </SheetContent>
  </Sheet>
);
