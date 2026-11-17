import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tabs } from "@infisical/cipher/ui/tabs";

import { findOrgMembershipRole } from "@app/helpers/roles";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { roleOptions } from "../roles";
import { failed, saved } from "../toast";
import { Muted } from "../ui";

export const CreateIdentitySheet = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { data: roles = [] } = access.useOrgRoles(orgId);
  const { data: organization } = access.useOrganization(orgId);
  const create = access.useCreateOrgIdentity();
  const addUniversalAuth = access.useAddIdentityUniversalAuth();
  const link = access.useCreateOrgIdentityMembership();
  const isSubOrg = useV4Session().organization.isSubOrganization;
  const { data: available = [], isPending: availablePending } = access.useAvailableOrgIdentities({
    enabled: open && isSubOrg
  });
  const [mode, setMode] = useState<"create" | "assign">("create");
  const [identityId, setIdentityId] = useState("");
  const defaultRole = organization
    ? (findOrgMembershipRole(roles, organization.defaultMembershipRole)?.slug ?? "")
    : "";
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const close = (next: boolean) => {
    if (!next) {
      setName("");
      setRole(undefined);
      setError(undefined);
      setMode("create");
      setIdentityId("");
    }
    onOpenChange(next);
  };
  const selectedRole = role ?? defaultRole;

  const assign = async () => {
    if (!identityId) {
      setError("Required");
      return;
    }
    setPending(true);
    try {
      await link.mutateAsync({ identityId, roles: [{ role: selectedRole, isTemporary: false }] });
      saved("Successfully linked identity");
      close(false);
      go(accessLinks.orgIdentity(orgId, identityId));
    } catch (cause) {
      failed("Failed to link machine identity", cause);
    } finally {
      setPending(false);
    }
  };

  const submit = async () => {
    if (mode === "assign") {
      await assign();
      return;
    }
    if (!name.trim()) {
      setError("Required");
      return;
    }
    setPending(true);
    try {
      const identity = await create.mutateAsync({
        name: name.trim(),
        role: selectedRole || undefined,
        hasDeleteProtection: true,
        organizationId: orgId
      });
      await addUniversalAuth.mutateAsync({
        organizationId: orgId,
        identityId: identity.id,
        ...UNIVERSAL_AUTH_DEFAULTS
      });
      saved("Successfully created machine identity");
      close(false);
      go(accessLinks.orgIdentity(orgId, identity.id));
    } catch (cause) {
      failed("Failed to create machine identity", cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>
            {isSubOrg
              ? "Add machine identity to sub-organization"
              : "Create organization machine identity"}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id="create-org-identity"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              {isSubOrg && (
                <Stack gap={8}>
                  <Tabs
                    variant="segmented"
                    label="Machine identity assignment mode"
                    value={mode}
                    onChange={(next) => {
                      setMode(next as "create" | "assign");
                      setError(undefined);
                    }}
                    tabs={[
                      { value: "create", label: "Create new" },
                      { value: "assign", label: "Assign existing" }
                    ]}
                  />
                  <Muted>
                    {mode === "assign"
                      ? "Reuse an existing machine identity from your parent organization."
                      : "Creates a machine identity managed by this sub-organization."}
                  </Muted>
                </Stack>
              )}
              {mode === "create" ? (
                <Field label="Name" error={error}>
                  <Input
                    autoFocus
                    autoComplete="off"
                    placeholder="Machine 1"
                    value={name}
                    invalid={Boolean(error)}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(undefined);
                    }}
                  />
                </Field>
              ) : (
                <Field label="Machine identity" error={error}>
                  <Combobox
                    label="Machine identity"
                    placeholder="Select machine identity..."
                    emptyText={
                      availablePending
                        ? "Loading machine identities..."
                        : "Every parent organization machine identity is already here"
                    }
                    options={available.map((entry) => ({ value: entry.id, label: entry.name }))}
                    value={identityId}
                    invalid={Boolean(error)}
                    onChange={(value) => {
                      setIdentityId(value);
                      setError(undefined);
                    }}
                  />
                </Field>
              )}
              <Field label="Role">
                <Select
                  label="Role"
                  placeholder="Select role..."
                  value={selectedRole}
                  options={roleOptions(roles)}
                  onChange={setRole}
                />
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-org-identity" loading={pending}>
              {mode === "assign" ? "Assign to sub-organization" : "Create"}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
