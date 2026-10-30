import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { useAccess } from "../context";
import { DEFAULT_UNIVERSAL_AUTH, type OrgIdentity } from "../model";
import { ADDED_TODAY } from "./memberships";

export const roleOptions = (
  roles: readonly { slug: string; name: string; description?: string }[]
) =>
  roles.map((role) => ({
    value: role.slug,
    label: role.name,
    description: role.description ?? "No description"
  }));

export const CreateIdentitySheet = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { data, update, saved, navigate } = useAccess();
  const [name, setName] = useState("");
  const [role, setRole] = useState(data.defaultOrgRole);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const close = (next: boolean) => {
    if (!next) {
      setName("");
      setRole(data.defaultOrgRole);
      setError(undefined);
    }
    onOpenChange(next);
  };
  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create organization machine identity</SheetTitle>
          <SheetDescription>Create a new machine identity in the organization</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="create-org-identity"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) {
                setError("Required");
                return;
              }
              setPending(true);
              window.setTimeout(() => {
                const identity: OrgIdentity = {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  role,
                  authMethods: ["universal"],
                  hasDeleteProtection: true,
                  metadata: [],
                  createdAt: ADDED_TODAY,
                  universalAuth: DEFAULT_UNIVERSAL_AUTH
                };
                update((current) => ({
                  ...current,
                  orgIdentities: [...current.orgIdentities, identity]
                }));
                setPending(false);
                saved("Successfully created machine identity");
                close(false);
                navigate({
                  detail: {
                    kind: "org-identity",
                    id: identity.id,
                    label: identity.name,
                    mono: true
                  }
                });
              }, 400);
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
                  value={role}
                  options={roleOptions(data.orgRoles)}
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
