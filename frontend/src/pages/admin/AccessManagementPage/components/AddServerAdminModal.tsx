import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useAdminGetUsers, useAdminGrantServerAdminAccess } from "@app/hooks/api";
import { User } from "@app/hooks/api/users/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

const getUserLabel = (user: Pick<User, "email" | "firstName" | "lastName" | "username" | "id">) => {
  const { firstName, lastName, username, email } = user;

  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const userEmail = email || username;

  if (!name) return userEmail;

  return `${name}${userEmail ? ` (${userEmail})` : ""}`;
};

const AddServerAdminSchema = z.object({
  user: z.object({
    id: z.string(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    email: z.string().nullish(),
    username: z.string()
  })
});

type FormData = z.infer<typeof AddServerAdminSchema>;

const Content = ({ onClose }: ContentProps) => {
  const grantAdmin = useAdminGrantServerAdminAccess();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(AddServerAdminSchema)
  });

  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useDebounce(searchUserFilter, 500);

  const { data, isPending } = useAdminGetUsers({
    limit: 20,
    searchTerm: debouncedSearchTerm,
    adminsOnly: false
  });

  const { users: usersData = [] } = data ?? {};
  const users = usersData.filter((user) => !user.superAdmin);

  const onSubmit = async ({ user }: FormData) => {
    await grantAdmin.mutateAsync(user.id);

    createNotification({
      type: "success",
      text: "Successfully granted server admin status"
    });
    onClose();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>User</FieldLabel>
            <FilterableSelect
              isLoading={searchUserFilter !== debouncedSearchTerm || isPending}
              className="w-full"
              placeholder="Search users..."
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
        name="user"
      />
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Grant
        </Button>
      </DialogFooter>
    </form>
  );
};

export const AddServerAdminModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Grant Server Admin</DialogTitle>
          <DialogDescription>Grant server admin status to a user.</DialogDescription>
        </DialogHeader>
        <Content onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};
