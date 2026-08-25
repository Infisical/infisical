import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogClose,
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
import { useOrganization } from "@app/context";
import { useCreateRelay } from "@app/hooks/api/relays";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  host: z.string().trim().min(1, "Host is required")
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RelayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate();
  const { mutateAsync: createRelay, isPending: isCreating } = useCreateRelay();
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", host: "" }
  });
  const name = watch("name");
  const host = watch("host");
  const areRequiredFieldsProvided = Boolean(name.trim() && host.trim());

  const onSubmit = async ({ name: relayName, host: relayHost }: FormData) => {
    try {
      const relay = await createRelay({
        name: relayName,
        host: relayHost,
        authMethod: { method: "token" }
      });

      onOpenChange(false);
      navigate({
        to: "/organizations/$orgId/networking/relays/$relayId",
        params: { orgId, relayId: relay.id }
      });
    } catch {
      // The shared mutation error handler displays the API error.
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Relay</DialogTitle>
          <DialogDescription>
            Generate an enrollment token for a relay on its detail page.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="relay-name">Name</FieldLabel>
                <Input
                  id="relay-name"
                  {...field}
                  placeholder="my-relay"
                  isError={Boolean(error)}
                  autoFocus
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="host"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="relay-host">Host</FieldLabel>
                <Input
                  id="relay-host"
                  {...field}
                  placeholder="10.0.0.5 or relay.example.com"
                  isError={Boolean(error)}
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
              isPending={isCreating || isSubmitting}
              isDisabled={isCreating || isSubmitting || !areRequiredFieldsProvided}
            >
              Create Relay
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
