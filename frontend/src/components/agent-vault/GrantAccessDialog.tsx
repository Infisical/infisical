import { useEffect, useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel
} from "@app/components/v3";
import { actorIdsPayload } from "@app/helpers/agentVaultMembers";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultAccessBundleMembers,
  useListAgentVaultMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductActor } from "@app/hooks/api/agentVault/types";

import { MEMBER_KIND, memberDisplayName, memberSubtitle } from "./MemberName";
import { PendingInvitationBadge } from "./PendingInvitationBadge";

const PICKER_LIMIT = 50;

type Option = {
  actor: TAgentVaultProductActor;
  label: string;
  subtitle: string;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
};

export const GrantAccessDialog = ({ isOpen, onOpenChange, accessBundleId }: Props) => {
  const addMembers = useAddAgentVaultAccessBundleMembers();

  const [selected, setSelected] = useState<Option[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  useEffect(() => {
    if (isOpen) {
      setSelected([]);
      setSearch("");
    }
  }, [isOpen]);

  const { data, isFetching } = useListAgentVaultMembers(
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    isOpen
  );

  const options = useMemo<Option[]>(
    () =>
      (data?.members ?? []).map((member) => ({
        actor: member.actor,
        label: memberDisplayName(member.actor),
        subtitle: memberSubtitle(member.actor)
      })),
    [data]
  );

  const handleAdd = async () => {
    try {
      if (!selected.length) return;

      const { members: granted, skipped } = await addMembers.mutateAsync({
        accessBundleId,
        ...actorIdsPayload(selected.map((option) => option.actor))
      });

      if (!granted.length) {
        createNotification({
          text:
            selected.length === 1
              ? `"${selected[0].label}" already has this access bundle`
              : `All ${selected.length} selected members already have this access bundle`,
          type: "info"
        });
      } else {
        const grantedText =
          granted.length === 1 && selected.length === 1
            ? `Access bundle granted to "${selected[0].label}"`
            : `Access bundle granted to ${granted.length} members`;
        createNotification({
          text: skipped.length ? `${grantedText}. ${skipped.length} already had it.` : grantedText,
          type: "success"
        });
      }
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Access</DialogTitle>
          <DialogDescription>
            Whoever has access to this bundle can create sessions with it. They must already be a
            member of Agent Vault.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="agent-vault-grant-to">Grant To</FieldLabel>
          <FieldContent>
            <Combobox
              id="agent-vault-grant-to"
              multiple
              options={options}
              value={selected}
              shouldFilter={false}
              isLoading={isFetching}
              // Without this a chip already picked vanishes when the next search returns a page it is not on.
              includeMissingSelectedOptions
              onInputValueChange={setSearch}
              getOptionValue={(option) => `${option.actor.type}:${option.actor.id}`}
              getOptionLabel={(option) => option.label}
              getOptionKeywords={(option) => [option.subtitle]}
              placeholder="Pick users, groups, or machine identities..."
              searchPlaceholder="Pick users, groups, or machine identities..."
              searchAriaLabel="Search users, groups, and machine identities"
              emptyMessage={(inputValue) =>
                inputValue ? "No matches." : "No members yet. Add them under Access Control first."
              }
              clearAriaLabel="Clear all grantees"
              modal
              onValueChange={(next) => setSelected([...next])}
              renderValue={(option) => {
                const { icon: Icon } = MEMBER_KIND[option.actor.type];
                return (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{option.label}</span>
                  </span>
                );
              }}
              renderOption={(option) => {
                const { icon: Icon } = MEMBER_KIND[option.actor.type];
                return (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      <span className="block truncate text-xs leading-4 text-muted">
                        {option.subtitle}
                      </span>
                    </span>
                    <PendingInvitationBadge
                      isPending={
                        option.actor.type === AgentVaultMemberType.User &&
                        option.actor.isOrgMembershipPending
                      }
                    />
                  </span>
                );
              }}
            />
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button
            variant="av"
            isDisabled={!selected.length}
            isPending={addMembers.isPending}
            onClick={async () => handleAdd()}
          >
            Grant Access
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
