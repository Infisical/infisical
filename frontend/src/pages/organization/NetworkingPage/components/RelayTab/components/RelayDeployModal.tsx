import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { useCreateRelay } from "@app/hooks/api/relays";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "name" }),
  host: z.string().trim().min(1, "Host is required")
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated?: (relayId: string) => void;
};

const Content = ({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated?: (relayId: string) => void;
}) => {
  const { mutateAsync: createRelay, isPending } = useCreateRelay();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", host: "" }
  });

  const onSubmit = async ({ name, host }: FormData) => {
    try {
      const relay = await createRelay({
        name: name.trim(),
        host: host.trim(),
        authMethod: { method: "token" }
      });
      createNotification({ type: "success", text: "Relay created" });
      onCreated?.(relay.id);
      onClose();
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.message || "Failed to create relay"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="my-relay" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="host"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Host" isRequired isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="10.0.0.5 or relay.example.com" />
          </FormControl>
        )}
      />
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="submit"
          isLoading={isPending || isSubmitting}
          isDisabled={isPending || isSubmitting}
        >
          Create Relay
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary">Cancel</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const RelayDeployModal = ({ isOpen, onOpenChange, onCreated }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Create Relay" subTitle="Create a new relay to route gateway traffic.">
        <Content onClose={() => onOpenChange(false)} onCreated={onCreated} />
      </ModalContent>
    </Modal>
  );
};
