import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" }
  });

  const onSubmit = async ({ name }: FormData) => {
    const existingNames = gateways?.map((g) => g.name) ?? [];
    if (existingNames.includes(name.trim())) {
      createNotification({ type: "error", text: "A gateway with this name already exists." });
      return;
    }

    try {
      const gateway = await createGateway({ name, authMethod: { method: "token" } });
      onClose();
      navigate({
        to: "/organizations/$orgId/networking/gateways/$gatewayId" as const,
        params: { orgId, gatewayId: gateway.id }
      });
    } catch {
      createNotification({ type: "error", text: "Failed to create gateway" });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Name"
            tooltipText="The name for your gateway."
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="Enter gateway name..." />
          </FormControl>
        )}
      />

      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          colorSchema="secondary"
          type="submit"
          isLoading={isPending || isSubmitting}
        >
          Create
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const GatewayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md" title="Create Gateway" bodyClassName="overflow-visible">
        <Content onClose={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
