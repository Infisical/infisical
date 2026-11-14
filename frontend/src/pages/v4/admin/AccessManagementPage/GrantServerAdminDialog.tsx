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

import { useDebounce } from "@app/hooks";
import type { User } from "@app/hooks/api/users/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { displayName } from "./users";

const userLabel = (user: User) => {
  const name = displayName(user);
  const email = user.email || user.username;
  if (!name) return email;
  return `${name}${email ? ` (${email})` : ""}`;
};

const GrantForm = ({ onClose }: { onClose: () => void }) => {
  const admin = useV4Adapter("admin");
  const grantAdmin = admin.useGrantServerAdminAccess();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useDebounce(search, 500);
  const [userId, setUserId] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const { data, isPending } = admin.useUsers({
    limit: 20,
    searchTerm: debounced,
    adminsOnly: false
  });
  const users = (data?.users ?? []).filter((user) => !user.superAdmin);

  return (
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>Grant server admin</DialogTitle>
        <DialogDescription>Grant server admin status to a user.</DialogDescription>
      </DialogHeader>
      <form
        id="grant-server-admin"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!userId) {
            setError("Select a user");
            return;
          }
          setPending(true);
          try {
            await grantAdmin.mutateAsync(userId);
            saved("Successfully granted server admin status");
            onClose();
          } catch {
            setPending(false);
          }
        }}
      >
        <Field label="User" error={error}>
          <Combobox
            label="User"
            placeholder="Search users..."
            emptyText="No users found"
            invalid={Boolean(error)}
            loading={search !== debounced || isPending}
            options={users.map((user) => ({ value: user.id, label: userLabel(user) }))}
            value={userId}
            onValueChange={(value) => {
              setUserId(value);
              setError(undefined);
            }}
            onSearch={(value) => {
              setSearch(value);
              if (!value) setDebounced("");
            }}
          />
        </Field>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="grant-server-admin" loading={pending}>
          Grant
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const GrantServerAdminDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <GrantForm onClose={() => onOpenChange(false)} />}
  </Dialog>
);
