import { useMemo, useState } from "react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
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
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setName("");
          setFormErrors([]);
        }
        onToggle(open);
      }}
    >
      <ModalContent title="Create Gateway Pool">
        <FormControl label="Name" isRequired isError={Boolean(errors.name)} errorText={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter gateway pool name"
            autoFocus
          />
        </FormControl>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline_bg" onClick={() => onToggle(false)} type="button">
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={createPool.isPending}>
            Create Pool
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
