import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  UnstableInput
} from "@app/components/v3";
import { useCreateCertificateInventoryView } from "@app/hooks/api/certificateInventoryViews";
import type { TInventoryViewFilters } from "@app/hooks/api/certificateInventoryViews/types";

import { type FilterRule, filtersToSearchParams } from "./inventory-types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  filters: FilterRule[];
  onViewCreated?: (viewId: string, filters: TInventoryViewFilters) => void;
};

export const SaveViewModal = ({
  isOpen,
  onOpenChange,
  projectId,
  filters,
  onViewCreated
}: Props) => {
  const [name, setName] = useState("");
  const { mutateAsync: createView, isPending } = useCreateCertificateInventoryView();

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      const apiFilters = filtersToSearchParams(filters);
      const result = await createView({
        projectId,
        name: name.trim(),
        filters: apiFilters
      });
      createNotification({
        text: `View "${name}" saved successfully`,
        type: "success"
      });
      setName("");
      onOpenChange(false);
      if (onViewCreated && result?.id) {
        onViewCreated(result.id, apiFilters);
      }
    } catch {
      createNotification({
        text: "Failed to save view",
        type: "error"
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setName("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save View As</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <UnstableInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter view name"
            autoFocus
            className="mt-2"
          />
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="project" isPending={isPending} isDisabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
