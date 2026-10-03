import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
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

type TFormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  gateway: TGatewayV2;
};

export const RenameGatewayModal = ({ isOpen, onToggle, gateway }: Props) => {
  const updateGateway = useUpdateGateway();

  const { control, handleSubmit, reset } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: gateway.name }
  });

  useEffect(() => {
    if (isOpen) reset({ name: gateway.name });
  }, [isOpen, gateway.name, reset]);

  const onFormSubmit = ({ name }: TFormData) => {
    if (name === gateway.name) {
      onToggle(false);
      return;
    }

    updateGateway.mutate(
      { gatewayId: gateway.id, name },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Gateway renamed" });
          onToggle(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Gateway</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="gateway-name">Name</FieldLabel>
                <Input
                  {...field}
                  id="gateway-name"
                  placeholder="prod-us-east"
                  isError={Boolean(error)}
                  autoFocus
                  autoComplete="off"
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="org"
              type="submit"
              isPending={updateGateway.isPending}
              isDisabled={updateGateway.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
