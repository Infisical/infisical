import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tabs } from "@app/components/v4/ui/tabs";

import { useAccess } from "../context";
import type { OrgIdentity, ProjectIdentity } from "../model";
import { Muted } from "../ui";
import { DEMO_PROJECT, TODAY } from "./identity-common";

export type AddIdentityMode = "create" | "assign";

const AddIdentityForm = ({
  initialMode,
  onClose
}: {
  initialMode?: AddIdentityMode;
  onClose: () => void;
}) => {
  const { data, update, saved, navigate } = useAccess();
  const assignable = data.orgIdentities.filter(
    (identity) =>
      !identity.managedByProject &&
      !data.projectIdentities.some((membership) => membership.identityId === identity.id)
  );
  const [mode, setMode] = useState<AddIdentityMode>(
    initialMode ?? (assignable.length > 0 ? "assign" : "create")
  );
  const [name, setName] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [role, setRole] = useState("no-access");
  const [errors, setErrors] = useState<{ name?: string; identity?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = () => {
    if (mode === "create" && !name.trim()) {
      setErrors({ name: "Required" });
      return;
    }
    if (mode === "assign" && !identityId) {
      setErrors({ identity: "Required" });
      return;
    }
    setPending(true);
    window.setTimeout(() => {
      const id = mode === "create" ? crypto.randomUUID() : identityId;
      const membership: ProjectIdentity = {
        identityId: id,
        roles: [{ id: crypto.randomUUID(), role, isTemporary: false }],
        createdAt: TODAY
      };
      const created: OrgIdentity[] =
        mode === "create"
          ? [
              {
                id,
                name: name.trim(),
                role: "no-access",
                authMethods: ["universal"],
                hasDeleteProtection: true,
                metadata: [],
                createdAt: TODAY,
                managedByProject: DEMO_PROJECT
              }
            ]
          : [];
      update((current) => ({
        ...current,
        orgIdentities: [...current.orgIdentities, ...created],
        projectIdentities: [...current.projectIdentities, membership]
      }));
      setPending(false);
      saved(`Successfully ${mode === "assign" ? "added" : "created"} machine identity`);
      onClose();
      if (mode === "create")
        navigate({
          detail: { kind: "project-identity", id, label: name.trim(), mono: true }
        });
    }, 500);
  };

  return (
    <>
      <SheetBody>
        <form
          id="add-project-identity"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Stack gap={8}>
              <Tabs
                variant="segmented"
                label="Identity assignment mode"
                value={mode}
                onChange={(next) => {
                  setMode(next as AddIdentityMode);
                  setErrors({});
                  if (next === "create") setIdentityId("");
                  else setName("");
                }}
                tabs={[
                  { value: "create", label: "Create new" },
                  { value: "assign", label: "Assign existing" }
                ]}
              />
              <Muted>
                {mode === "assign"
                  ? "Reuse an organization machine identity, which can be added to several projects."
                  : "Create a dedicated machine identity managed at the project level."}
              </Muted>
            </Stack>
            {mode === "create" ? (
              <Field label="Name" error={errors.name}>
                <Input
                  autoFocus
                  placeholder="Machine 1"
                  autoComplete="off"
                  name="project-identity-name"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors({});
                  }}
                />
              </Field>
            ) : (
              <Field label="Machine identity" error={errors.identity}>
                <Combobox
                  label="Machine identity"
                  placeholder="Select machine identity..."
                  emptyText="No machine identities available"
                  options={assignable.map((identity) => ({
                    value: identity.id,
                    label: identity.name
                  }))}
                  value={identityId}
                  invalid={Boolean(errors.identity)}
                  onChange={(value) => {
                    setIdentityId(value);
                    setErrors({});
                  }}
                />
              </Field>
            )}
            <Field label="Role">
              <Combobox
                label="Role"
                placeholder="Select role..."
                options={data.projectRoles.map((item) => ({
                  value: item.slug,
                  label: item.name,
                  meta: item.description
                }))}
                value={role}
                onChange={(value) => value && setRole(value)}
              />
            </Field>
          </Stack>
        </form>
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="add-project-identity" loading={pending}>
          {mode === "assign" ? "Add" : "Create"}
        </Button>
      </SheetFooter>
    </>
  );
};

export const AddProjectIdentitySheet = ({
  open,
  initialMode,
  onOpenChange
}: {
  open: boolean;
  initialMode?: AddIdentityMode;
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Add machine identity to project</SheetTitle>
        <SheetDescription>Create a new machine identity or assign an existing one</SheetDescription>
      </SheetHeader>
      {open && <AddIdentityForm initialMode={initialMode} onClose={() => onOpenChange(false)} />}
    </SheetContent>
  </Sheet>
);
