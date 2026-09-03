import { useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useAddAgentVaultProductMember,
  useListAgentVaultProductIdentityMembers
} from "@app/hooks/api/agentVault";
import { useSearchOrgIdentityMemberships } from "@app/hooks/api/identities";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleField } from "./ProductRoleField";

type TOption = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddIdentityDialog = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: orgIdentities } = useSearchOrgIdentityMemberships({
    orgId: currentOrg.id,
    limit: 100,
    offset: 0,
    search: {}
  });
  const { data: members = [] } = useListAgentVaultProductIdentityMembers();
  const addMember = useAddAgentVaultProductMember();

  const [identity, setIdentity] = useState<TOption | null>(null);
  const [role, setRole] = useState<string>(ProjectMembershipRole.Member);

  const options = useMemo(() => {
    const attached = new Set(members.map((member) => member.identityId));
    return (orgIdentities?.identities ?? [])
      .filter((row) => !attached.has(row.identity.id))
      .map((row) => ({ value: row.identity.id, label: row.identity.name }));
  }, [orgIdentities, members]);

  const handleAdd = async () => {
    if (!identity) return;
    await addMember.mutateAsync({ projectId: currentProject.id, identityId: identity.value, role });
    createNotification({ text: `"${identity.label}" now has Agent Vault`, type: "success" });
    setIdentity(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Machine Identity</DialogTitle>
          <DialogDescription>
            An identity with Agent Vault can mint its own sessions over the bundles granted to it.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Machine Identity</FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={identity}
              onChange={(value) => setIdentity((value ?? null) as TOption | null)}
              options={options}
              placeholder="Search machine identities..."
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Product Role</FieldLabel>
          <FieldContent>
            <ProductRoleField value={role} onChange={setRole} idPrefix="add-identity-role" />
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={addMember.isPending}
            isDisabled={!identity}
            onClick={handleAdd}
          >
            Add Identity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
