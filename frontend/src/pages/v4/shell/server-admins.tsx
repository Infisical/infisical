import { useDeferredValue, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { List, ListRow } from "@infisical/cipher/ui/list";

import { useV4Adapter } from "../data/adapters";

export const ServerAdminsDialog = ({
  orgId,
  open,
  onOpenChange
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search).trim().toLowerCase();
  const { data: admins = [], isPending } = useV4Adapter("shell").useServerAdmins(orgId, open);
  const shown = admins.filter(
    (admin) =>
      !term ||
      [admin.email, admin.firstName, admin.lastName].some((value) =>
        value?.toLowerCase().includes(term)
      )
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Server admins</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Input
            type="search"
            icon="search"
            placeholder="Search server admins"
            aria-label="Search server admins"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <List
            label="Server admins"
            variant="framed"
            loading={isPending}
            empty={
              <EmptyState
                size="sm"
                icon="users"
                title={admins.length ? "No server admins match your search" : "No server admins"}
              />
            }
          >
            {shown.map((admin) => {
              const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ");
              return (
                <ListRow
                  key={admin.id}
                  value={admin.id}
                  label={name || admin.username}
                  title={name || admin.username}
                  description={admin.email}
                  selectable={false}
                />
              );
            })}
          </List>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
