import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useCreateGatewayPool } from "@app/hooks/api/gateway-pools";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255)
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
};

export const CreateGatewayPoolModal = ({ isOpen, onToggle }: Props) => {
  const createPool = useCreateGatewayPool();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" }
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createPool.mutateAsync({
        name: data.name
      });
      createNotification({ type: "success", text: `Pool "${data.name}" created` });
      reset();
      onToggle(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create pool";
      createNotification({ type: "error", text: message });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onToggle}>
      <ModalContent title="Create Gateway Pool">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormControl
            label="Name"
            isRequired
            isError={Boolean(errors.name)}
            errorText={errors.name?.message}
          >
            <Input {...register("name")} placeholder="e.g. us-east-1 prod VPC" autoFocus />
          </FormControl>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline_bg" onClick={() => onToggle(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create Pool
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
