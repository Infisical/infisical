import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useAdminGetUsers, useServerAdminCreateOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

type Invitee = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

const getUserLabel = ({ firstName, lastName, username, email }: Invitee) => {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const userEmail = email || username;

  if (!name) return userEmail ?? "Unnamed user";

  return `${name}${userEmail ? ` (${userEmail})` : ""}`;
};

const AddOrgSchema = z.object({
  name: GenericResourceNameSchema.nonempty("Organization name required"),
  invitees: z
    .object({
      id: z.string(),
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      email: z.string().nullish(),
      username: z.string().nullish()
    })
    .array()
    .min(1, "At least one admin is required")
});

type FormData = z.infer<typeof AddOrgSchema>;

const Content = ({ onClose }: ContentProps) => {
  const adminSelectId = useId();
  const createOrg = useServerAdminCreateOrganization();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      invitees: []
    },
    resolver: zodResolver(AddOrgSchema)
  });

  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useDebounce(searchUserFilter, 500);

  const { data, isPending } = useAdminGetUsers({
    limit: 20,
    searchTerm: debouncedSearchTerm,
    adminsOnly: false
  });

  const { users = [] } = data ?? {};

  const onSubmit = async ({ name, invitees }: FormData) => {
    await createOrg.mutateAsync({
      name,
      inviteAdminEmails: invitees
        .filter((user) => Boolean(user.email))
        .map((user) => user.email) as string[]
    });

    createNotification({
      type: "success",
      text: "Successfully created organization"
    });
    onClose();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="new-organization-name">Name</FieldLabel>
            <Input
              id="new-organization-name"
              autoFocus
              value={value}
              onChange={onChange}
              placeholder="My Organization"
              isError={Boolean(error)}
              autoComplete="off"
              name="new-organization-name"
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field, fieldState: { error } }) => {
          const email = searchUserFilter.trim();
          const isNewEmail =
            z.string().email().safeParse(email).success &&
            ![...users, ...field.value].some(
              (user) => (user.email || user.username)?.toLowerCase() === email.toLowerCase()
            );
          const inviteOption: Invitee | null = isNewEmail
            ? { id: `invite:${email.toLowerCase()}`, email }
            : null;

          return (
            <Field>
              <FieldLabel htmlFor={adminSelectId}>Assign Organization Admins</FieldLabel>
              <Combobox<Invitee>
                id={adminSelectId}
                multiple
                options={inviteOption ? [inviteOption, ...users] : users}
                value={field.value}
                onValueChange={field.onChange}
                onClear={() => field.onChange([])}
                getOptionLabel={getUserLabel}
                getOptionValue={(user) => user.id}
                renderOption={(user) =>
                  user.id.startsWith("invite:") ? `Invite "${user.email}"` : getUserLabel(user)
                }
                placeholder="Search users or invite by email..."
                searchPlaceholder="Search users or enter an email..."
                searchAriaLabel="Search users or enter an email to invite"
                emptyMessage="No users found. Enter a valid email address to invite a new user."
                isLoading={searchUserFilter !== debouncedSearchTerm || isPending}
                isError={Boolean(error)}
                shouldFilter={false}
                includeMissingSelectedOptions
                modal
                onInputValueChange={(value) => {
                  setSearchUserFilter(value);
                  if (!value) setDebouncedSearchTerm("");
                }}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          );
        }}
        control={control}
        name="invitees"
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Add organization
        </Button>
      </DialogFooter>
    </form>
  );
};

export const AddOrganizationModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Add Organization</DialogTitle>
          <DialogDescription>
            Create an organization and assign its initial admins.
          </DialogDescription>
        </DialogHeader>
        <Content onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};
