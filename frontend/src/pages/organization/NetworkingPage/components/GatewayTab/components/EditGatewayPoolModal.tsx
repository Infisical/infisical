import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useUpdateGatewayPool } from "@app/hooks/api/gateway-pools";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255)
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  pool?: TGatewayPool;
};

export const EditGatewayPoolModal = ({ isOpen, onToggle, pool }: Props) => {
  const updatePool = useUpdateGatewayPool();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (pool) {
      reset({ name: pool.name });
    }
  }, [pool, reset]);

  const onSubmit = async (data: FormData) => {
    if (!pool) return;
    try {
      await updatePool.mutateAsync({
        poolId: pool.id,
        name: data.name
      });
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
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormControl
            label="Name"
            isRequired
            isError={Boolean(errors.name)}
            errorText={errors.name?.message}
          >
            <Input {...register("name")} />
          </FormControl>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline_bg" onClick={() => onToggle(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
