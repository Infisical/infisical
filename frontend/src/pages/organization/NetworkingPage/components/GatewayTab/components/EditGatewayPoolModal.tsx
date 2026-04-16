import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
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
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent title="Edit Gateway Pool">
        <FormControl
          label="Name"
          isRequired
          isError={Boolean(errors.name)}
          errorText={errors.name}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormControl>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline_bg" onClick={() => onToggle(false)} type="button">
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={updatePool.isPending}>
            Save
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
