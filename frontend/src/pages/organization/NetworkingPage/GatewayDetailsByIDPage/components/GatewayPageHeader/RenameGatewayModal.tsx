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
import { useUpdateGateway } from "@app/hooks/api/gateways-v2";
import { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "name" })
});

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  gateway: TGatewayV2;
};

export const RenameGatewayModal = ({ isOpen, onToggle, gateway }: Props) => {
  const updateGateway = useUpdateGateway();
  const [name, setName] = useState(gateway.name);
  const [formErrors, setFormErrors] = useState<z.ZodIssue[]>([]);

  const errors = useMemo(() => {
    const errorMap: Record<string, string | undefined> = {};
    formErrors.forEach((issue) => {
      if (issue.path.length > 0) errorMap[String(issue.path[0])] = issue.message;
    });
    return errorMap;
  }, [formErrors]);

  useEffect(() => {
    if (isOpen) {
      setName(gateway.name);
      setFormErrors([]);
    }
  }, [isOpen, gateway.name]);

  const handleSubmit = async () => {
    setFormErrors([]);
    const validation = formSchema.safeParse({ name });
    if (!validation.success) {
      setFormErrors(validation.error.issues);
      return;
    }

    if (name.trim() === gateway.name) {
      onToggle(false);
      return;
    }

    try {
      await updateGateway.mutateAsync({ gatewayId: gateway.id, name: name.trim() });
      createNotification({ type: "success", text: "Gateway renamed" });
      onToggle(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to rename gateway";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Gateway</DialogTitle>
          <DialogDescription>
            The gateway keeps its ID, so anything already pointing at it carries on working.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="rename-gateway-name">Name</FieldLabel>
          <Input
            id="rename-gateway-name"
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
          <Button variant="org" onClick={handleSubmit} isPending={updateGateway.isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
