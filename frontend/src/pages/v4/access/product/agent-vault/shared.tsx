import { useEffect, useState } from "react";
import { MailIcon } from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Label } from "@app/components/v4/ui/label";
import { Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS, formatProjectRoleName } from "@app/helpers/roles";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultProductActor,
  TAgentVaultProductMember
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../../data/adapters";
import { useDebounced } from "../../org/use-debounced";
import { failed, saved, toast } from "../../toast";
import { Muted } from "../../ui";

export const DEFAULT_PRODUCT_ROLE = ProjectMembershipRole.Member;

export const memberDisplayName = (member: TAgentVaultProductActor) => {
  if (member.type !== AgentVaultMemberType.User) return member.name;
  return (
    [member.firstName, member.lastName].filter(Boolean).join(" ") ||
    member.username ||
    member.email ||
    "Unknown"
  );
};

export const ProductRoleBadge = ({ role }: { role: string }) => (
  <Badge tone={role === ProjectMembershipRole.Admin ? "accent" : "soft"}>
    {formatProjectRoleName(role)}
  </Badge>
);

export const PendingInvitationBadge = () => (
  <Tooltip content="Access begins once they accept their organization invitation.">
    <Badge tone="info">
      <Icon icon={MailIcon} size={12} />
      Pending invitation
    </Badge>
  </Tooltip>
);

export const ProductRoleField = ({
  value,
  onChange,
  idPrefix
}: {
  value: string;
  onChange: (role: string) => void;
  idPrefix: string;
}) => (
  <Field label="Product role" group>
    <RadioGroup value={value} onValueChange={onChange} aria-label="Product role">
      {AGENT_VAULT_PRODUCT_ROLE_OPTIONS.map((role) => (
        <Stack key={role.value} gap={4}>
          <Stack gap={8}>
            <RadioGroupItem id={`${idPrefix}-${role.value}`} value={role.value} />
            <Label htmlFor={`${idPrefix}-${role.value}`}>{role.label}</Label>
          </Stack>
          <Muted>{role.description}</Muted>
        </Stack>
      ))}
    </RadioGroup>
  </Field>
);

export const useMemberList = <T extends AgentVaultMemberType>(projectId: string, actorType: T) => {
  const av = useV4Adapter("agentVault");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const list = av.useMembers(projectId, {
    actorType,
    search: debouncedSearch || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const rows = list.data?.members ?? [];
  const totalCount = list.data?.totalCount ?? 0;

  useEffect(() => {
    if (!list.isPending && page > 1 && (page - 1) * perPage >= totalCount)
      setPage(Math.max(1, Math.ceil(totalCount / perPage)));
  }, [list.isPending, page, perPage, totalCount]);

  return {
    rows,
    isPending: list.isPending,
    error: list.error,
    search,
    searching: Boolean(debouncedSearch),
    setSearch: (value: string) => {
      setSearch(value);
      setPage(1);
    },
    pagination:
      !list.isPending && totalCount > 0 ? (
        <Pagination
          label="Pages"
          variant="compact"
          page={page}
          total={totalCount}
          pageSize={perPage}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPerPage(size);
            setPage(1);
          }}
        />
      ) : undefined
  };
};

export const ChangeRoleDialog = ({
  projectId,
  member,
  onOpenChange
}: {
  projectId: string;
  member?: TAgentVaultProductMember;
  onOpenChange: (open: boolean) => void;
}) => {
  const updateRole = useV4Adapter("agentVault").useUpdateMemberRoles(projectId);
  const [role, setRole] = useState<string>(DEFAULT_PRODUCT_ROLE);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  const submit = async () => {
    if (!member) return;
    setPending(true);
    try {
      const { members } = await updateRole.mutateAsync({
        userIds: member.type === AgentVaultMemberType.User ? [member.id] : undefined,
        groupIds: member.type === AgentVaultMemberType.Group ? [member.id] : undefined,
        machineIdentityIds:
          member.type === AgentVaultMemberType.MachineIdentity ? [member.id] : undefined,
        role
      });
      const name = memberDisplayName(member);
      if (members.length) saved(`${name} is now ${role === "admin" ? "an admin" : "a member"}`);
      else
        toast({
          title: "Role not changed",
          description: `${name} may have been removed from this project or already has that role.`
        });
      onOpenChange(false);
    } catch (error) {
      failed("Failed to update role", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{`Change role for ${member ? memberDisplayName(member) : ""}`}</DialogTitle>
        </DialogHeader>
        <form
          id="change-product-role"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <ProductRoleField value={role} onChange={setRole} idPrefix="change-role" />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="change-product-role"
            loading={pending}
            disabled={!member || role === member.role}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
