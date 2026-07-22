import { useMemo, useState } from "react";
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
import { useCreateGatewayPool, useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "name" })
});

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
};

export const CreateGatewayPoolModal = ({ isOpen, onToggle }: Props) => {
  const createPool = useCreateGatewayPool();
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

  const handleSubmit = async () => {
    setFormErrors([]);
    const validation = formSchema.safeParse({ name });
    if (!validation.success) {
      setFormErrors(validation.error.issues);
      return;
    }

    const existingNames = pools?.map((p) => p.name) || [];
    if (existingNames.includes(name.trim())) {
      createNotification({
        type: "error",
        text: "A gateway pool with this name already exists."
      });
      return;
    }

    try {
      await createPool.mutateAsync({ name });
      createNotification({ type: "success", text: `Pool "${name}" created` });
      setName("");
      setFormErrors([]);
      onToggle(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create pool";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setName("");
          setFormErrors([]);
        }
        onToggle(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Gateway Pool</DialogTitle>
          <DialogDescription>
            Group gateways for high availability and automatic failover.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="gateway-pool-name">Name</FieldLabel>
          <Input
            id="gateway-pool-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter gateway pool name"
            autoFocus
            isError={Boolean(errors.name)}
          />
          <FieldError>{errors.name}</FieldError>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onToggle(false)} type="button">
            Cancel
          </Button>
          <Button variant="org" onClick={handleSubmit} isPending={createPool.isPending}>
            Create Pool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
