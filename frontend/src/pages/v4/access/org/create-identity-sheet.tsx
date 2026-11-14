import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
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

import { findOrgMembershipRole } from "@app/helpers/roles";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId } from "../permissions";
import { roleOptions } from "../roles";
import { failed, saved } from "../toast";

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
  );
};
