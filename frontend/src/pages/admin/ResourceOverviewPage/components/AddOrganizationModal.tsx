import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CreatableSelect,
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
import { User } from "@app/hooks/api/users/types";
import { GenericResourceNameSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

type Invitee = Pick<User, "email" | "firstName" | "lastName" | "username" | "id">;
type NewOption = { label: string; value: string };

const getUserLabel = (user: Invitee | NewOption) => {
  if (Object.prototype.hasOwnProperty.call(user, "value")) {
    return (user as NewOption).label;
  }

  const { firstName, lastName, username, email } = user as Invitee;

  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const userEmail = email || username;

  if (!name) return userEmail;

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
  const createOrg = useServerAdminCreateOrganization();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm({
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

  const { append } = useFieldArray<FormData>({ control, name: "invitees" });

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
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Assign organization admins</FieldLabel>
            <CreatableSelect
              /* eslint-disable-next-line react/no-unstable-nested-components */
              noOptionsMessage={() => (
                <p>Invite new users to this organization by typing out their email address.</p>
              )}
              onCreateOption={(inputValue) =>
                append({
                  id: `${inputValue}_${Math.random()}`,
                  email: inputValue
                })
              }
              formatCreateLabel={(inputValue) => `Invite "${inputValue}"`}
              isValidNewOption={(input) =>
                Boolean(input) &&
                z.string().email().safeParse(input).success &&
                !users
                  ?.flatMap((user) => {
                    const emails: string[] = [];

                    if (user.email) {
                      emails.push(user.email);
                    }

                    if (user.username) {
                      emails.push(user.username);
                    }

                    return emails;
                  })
                  .includes(input)
              }
              isLoading={searchUserFilter !== debouncedSearchTerm || isPending}
              className="w-full"
              placeholder="Search users or invite new ones..."
              isMulti
              name="members"
              options={users}
              getOptionLabel={(user) => getUserLabel(user)}
              getOptionValue={(user) => user.id}
              value={field.value}
              onChange={field.onChange}
              onInputChange={(value) => {
                setSearchUserFilter(value);
                if (!value) setDebouncedSearchTerm("");
              }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
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
