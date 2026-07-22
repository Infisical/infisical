import { useEffect, useMemo, useState } from "react";
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
  Input
} from "@app/components/v3";
import { useListGatewayPools, useUpdateGatewayPool } from "@app/hooks/api/gateway-pools";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "name" })
});

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  pool?: TGatewayPool;
};

export const EditGatewayPoolModal = ({ isOpen, onToggle, pool }: Props) => {
  const updatePool = useUpdateGatewayPool();
  const { data: pools } = useListGatewayPools();
  const [name, setName] = useState("");
  const [formErrors, setFormErrors] = useState<z.ZodIssue[]>([]);

  const errors = useMemo(() => {
    const errorMap: Record<string, string | undefined> = {};
    formErrors.forEach((issue) => {
      if (issue.path.length > 0) errorMap[String(issue.path[0])] = issue.message;
    });
    return errorMap;
  }, [formErrors]);

  useEffect(() => {
    if (pool) {
      setName(pool.name);
      setFormErrors([]);
    }
  }, [pool]);

  const handleSubmit = async () => {
    if (!pool) return;
    setFormErrors([]);
    const validation = formSchema.safeParse({ name });
    if (!validation.success) {
      setFormErrors(validation.error.issues);
      return;
    }

    const existingNames = pools?.filter((p) => p.id !== pool.id).map((p) => p.name) || [];
    if (existingNames.includes(name.trim())) {
      createNotification({
        type: "error",
        text: "A gateway pool with this name already exists."
      });
      return;
    }

    try {
      await updatePool.mutateAsync({ poolId: pool.id, name });
      createNotification({ type: "success", text: "Pool updated" });
      onToggle(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update pool";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Gateway Pool</DialogTitle>
          <DialogDescription>Update the name shown across your organization.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="edit-gateway-pool-name">Name</FieldLabel>
          <Input
            id="edit-gateway-pool-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            isError={Boolean(errors.name)}
          />
          <FieldError>{errors.name}</FieldError>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onToggle(false)} type="button">
            Cancel
          </Button>
          <Button variant="org" onClick={handleSubmit} isPending={updatePool.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
