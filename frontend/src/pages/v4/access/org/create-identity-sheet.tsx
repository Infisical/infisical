import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
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
import { failed, readableFailure, saved } from "../toast";
import { useCustomRoleGate } from "./custom-role-gate";

const RootCreateIdentitySheet = ({
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
  const rbacGate = useCustomRoleGate("organization.org-identity");
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
    }
    onOpenChange(next);
  };
  const selectedRole = role ?? defaultRole;

  const submit = async () => {
    if (!name.trim()) {
      setError("Required");
      return;
    }
    if (selectedRole && rbacGate.blocked(selectedRole)) return;
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
    <>
      <Sheet open={open} onOpenChange={close}>
        <SheetContent pending={pending}>
          <SheetHeader>
            <SheetTitle>Create organization machine identity</SheetTitle>
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
                <Field label="Role">
                  <Select
                    label="Role"
                    placeholder="Select role..."
                    value={selectedRole}
                    options={roleOptions(roles)}
                    descriptionLayout="stacked"
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
                Create
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {rbacGate.upgradeGate}
    </>
  );
};

type SubOrgIdentityDraft = {
  mode: "create" | "assign";
  name: string;
  identityId: string;
  role?: string;
};

const EMPTY_SUB_ORG_IDENTITY: SubOrgIdentityDraft = { mode: "create", name: "", identityId: "" };

const validateSubOrgIdentity = (draft: SubOrgIdentityDraft) => {
  if (draft.mode === "assign")
    return draft.identityId ? true : { fields: { identity: "Select a machine identity" } };
  return draft.name.trim() ? true : { fields: { name: "Enter a name" } };
};

const SubOrgAddIdentitySheet = ({
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
  const [draft, setDraft] = useState(EMPTY_SUB_ORG_IDENTITY);
  const rbacGate = useCustomRoleGate("organization.org-identity");
  const { data: available = [], isPending: availablePending } = access.useAvailableOrgIdentities({
    enabled: open && draft.mode === "assign"
  });
  const close = () => {
    setDraft(EMPTY_SUB_ORG_IDENTITY);
    onOpenChange(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: Boolean(draft.name || draft.identityId || draft.role !== undefined),
    onDiscard: close
  });
  const update = (patch: Partial<SubOrgIdentityDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const defaultRole = organization
    ? (findOrgMembershipRole(roles, organization.defaultMembershipRole)?.slug ?? "")
    : "";
  const role = draft.role ?? defaultRole;

  const assign = async () => {
    await link
      .mutateAsync({ identityId: draft.identityId, roles: [{ role, isTemporary: false }] })
      .catch(readableFailure("Couldn't link machine identity"));
    saved("Successfully linked identity");
    return draft.identityId;
  };
  const createNew = async () => {
    const identity = await create
      .mutateAsync({
        name: draft.name.trim(),
        role: role || undefined,
        hasDeleteProtection: true,
        organizationId: orgId
      })
      .catch(readableFailure("Couldn't create machine identity"));
    await addUniversalAuth
      .mutateAsync({ organizationId: orgId, identityId: identity.id, ...UNIVERSAL_AUTH_DEFAULTS })
      .catch(readableFailure("Couldn't add Universal Auth"));
    saved("Successfully created machine identity");
    return identity.id;
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        open={open}
        title="Add machine identity to sub-organization"
        completeLabel={draft.mode === "assign" ? "Assign" : "Create"}
        onOpenChange={(next) => !next && requestDiscard()}
        onComplete={async () => {
          if (draft.mode === "create" && role && rbacGate.blocked(role)) return;
          const identityId = draft.mode === "assign" ? await assign() : await createNew();
          close();
          go(accessLinks.orgIdentity(orgId, identityId));
        }}
        steps={[
          {
            title: "Machine identity",
            validate: () => validateSubOrgIdentity(draft),
            content: (
              <Stack gap={16}>
                <Tabs
                  variant="segmented"
                  label="Machine identity assignment mode"
                  value={draft.mode}
                  onChange={(next) => update({ mode: next as SubOrgIdentityDraft["mode"] })}
                  tabs={[
                    { value: "create", label: "Create new" },
                    { value: "assign", label: "Assign existing" }
                  ]}
                />
                {draft.mode === "assign" ? (
                  <Field label="Machine identity" name="identity">
                    <Combobox
                      label="Machine identity"
                      placeholder="Select machine identity..."
                      emptyText={
                        availablePending
                          ? "Loading machine identities..."
                          : "Every parent organization machine identity is already here"
                      }
                      options={available.map((entry) => ({ value: entry.id, label: entry.name }))}
                      value={draft.identityId}
                      onChange={(identityId) => update({ identityId })}
                    />
                  </Field>
                ) : (
                  <Field label="Name" name="name">
                    <Input
                      autoComplete="off"
                      placeholder="Machine 1"
                      value={draft.name}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </Field>
                )}
                <Field label="Role">
                  <Select
                    label="Role"
                    placeholder="Select role..."
                    value={role}
                    options={roleOptions(roles)}
                    descriptionLayout="stacked"
                    onChange={(next) => update({ role: next })}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      {rbacGate.upgradeGate}
      <DiscardChangesAlertDialog {...discardDialogProps} title="Discard this machine identity?" />
    </>
  );
};

export const CreateIdentitySheet = (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) =>
  useV4Session().organization.isSubOrganization ? (
    <SubOrgAddIdentitySheet {...props} />
  ) : (
    <RootCreateIdentitySheet {...props} />
  );
