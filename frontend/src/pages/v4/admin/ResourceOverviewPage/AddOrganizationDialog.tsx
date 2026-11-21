import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { z } from "zod";

import { isValidEmail } from "@app/helpers/email";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { fullName } from "./shared";

type Invitee = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

const schema = z.object({
  name: GenericResourceNameSchema.nonempty("Organization name required"),
  invitees: z.array(z.custom<Invitee>()).min(1, "At least one admin is required")
});

const USER_LIMIT = 100;

const userLabel = (user: Invitee) => {
  const name = fullName(user);
  const email = user.email || user.username;
  if (!name) return email ?? "Unnamed user";
  return `${name}${email ? ` (${email})` : ""}`;
};

const AddOrganizationForm = ({ onClose }: { onClose: () => void }) => {
  const admin = useV4Adapter("admin");
  const createOrganization = admin.useCreateOrganization();
  const { data } = admin.useUsers({ limit: USER_LIMIT, adminsOnly: false });
  const [name, setName] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [errors, setErrors] = useState<{ name?: string; invitees?: string }>({});
  const [pending, setPending] = useState(false);
  const users: Invitee[] = data?.users ?? [];
  const options = [
    ...users,
    ...invitees.filter((invitee) => !users.some((user) => user.id === invitee.id))
  ].map((user) => ({ value: user.id, label: userLabel(user) }));

  const submit = async () => {
    const parsed = schema.safeParse({ name, invitees });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setErrors({ name: issues.name?.[0], invitees: issues.invitees?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await createOrganization.mutateAsync({
        name: parsed.data.name,
        inviteAdminEmails: [
          ...new Set(invitees.flatMap((invitee) => (invitee.email ? [invitee.email] : [])))
        ]
      });
      saved("Successfully created organization");
      onClose();
    } catch {
      // Reported by the mutation cache; the dialog stays open for a retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>Add organization</DialogTitle>
        <DialogDescription>Create an organization and assign its initial admins.</DialogDescription>
      </DialogHeader>
      <form
        id="add-organization"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={16}>
          <Field label="Name" error={errors.name}>
            <Input
              autoComplete="off"
              placeholder="My organization"
              value={name}
              invalid={Boolean(errors.name)}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
            />
          </Field>
          <Field
            label="Organization admins"
            error={errors.invitees}
            description="Search users or type an email to invite someone new."
          >
            <Combobox
              multiple
              label="Organization admins"
              placeholder="Search users or invite by email..."
              emptyText="No users found. Enter a valid email address to invite a new user."
              options={options}
              value={invitees.map((invitee) => invitee.id)}
              invalid={Boolean(errors.invitees)}
              onChange={(ids) => {
                const known = [...users, ...invitees];
                setInvitees(ids.flatMap((id) => known.find((user) => user.id === id) ?? []));
                setErrors((current) => ({ ...current, invitees: undefined }));
              }}
              onCreate={(query) => {
                const email = query.trim().toLowerCase();
                if (!isValidEmail(email)) {
                  setErrors((current) => ({
                    ...current,
                    invitees: "Enter a valid email address to invite a new user"
                  }));
                  return;
                }
                const match =
                  users.find((user) => (user.email || user.username)?.toLowerCase() === email) ??
                  ({ id: `invite:${email}`, email } satisfies Invitee);
                setInvitees((current) =>
                  current.some((invitee) => invitee.id === match.id) ? current : [...current, match]
                );
                setErrors((current) => ({ ...current, invitees: undefined }));
              }}
            />
          </Field>
        </Stack>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="add-organization" loading={pending}>
          Add organization
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const AddOrganizationDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <AddOrganizationForm onClose={() => onOpenChange(false)} />}
  </Dialog>
);
