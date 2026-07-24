import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways";
import { useCreateGateway } from "@app/hooks/api/gateways-v2";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ field: "name" })
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const Content = ({ onClose }: { onClose: () => void }) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate({ from: ROUTE_PATHS.Organization.NetworkingPage.path });
  const { data: gateways } = useQuery(gatewaysQueryKeys.listWithTokens());
  const { mutateAsync: createGateway, isPending } = useCreateGateway();

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" }
  });
  const name = watch("name");
  const isNameProvided = Boolean(name.trim());

  const onSubmit = async ({ name: gatewayName }: FormData) => {
    const existingNames = gateways?.map((g) => g.name) ?? [];
    if (existingNames.includes(gatewayName.trim())) {
      createNotification({ type: "error", text: "A gateway with this name already exists." });
      return;
    }

    try {
      const gateway = await createGateway({
        name: gatewayName,
        authMethod: { method: "token" }
      });
      onClose();
      navigate({
        to: "/organizations/$orgId/networking/gateways/$gatewayId" as const,
        params: { orgId, gatewayId: gateway.id }
      });
    } catch {
      // The shared mutation error handler displays the API error.
    }
  };

  return (
    <form className="contents" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="gateway-name">Name</FieldLabel>
            <Input
              id="gateway-name"
              {...field}
              placeholder="Enter gateway name"
              isError={Boolean(error)}
              autoFocus
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
          isPending={isPending || isSubmitting}
          isDisabled={!isNameProvided}
        >
          Create Gateway
        </Button>
      </DialogFooter>
    </form>
  );
};

export const GatewayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Gateway</DialogTitle>
          <DialogDescription>
            Create a gateway to access private network resources.
          </DialogDescription>
        </DialogHeader>
        <Content onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};
