import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways";
import { useCreateGateway } from "@app/hooks/api/gateways-v2";
import { useGetRelays } from "@app/hooks/api/relays/queries";
import { slugSchema } from "@app/lib/schemas";

import { RelayOption } from "./RelayOption";

const formSchema = z.object({
  name: slugSchema({ field: "name" }),
  relay: z
    .object({ id: z.string(), name: z.string() }, { required_error: "Relay is required" })
    .nullable()
    .refine((val) => val !== null, { message: "Relay is required" })
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
  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const { mutateAsync: createGateway, isPending } = useCreateGateway();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      relay: { id: "_auto", name: "Auto Select Relay" }
    }
  });

  const onSubmit = async ({ name, relay }: FormData) => {
    const existingNames = gateways?.map((g) => g.name) ?? [];
    if (existingNames.includes(name.trim())) {
      createNotification({ type: "error", text: "A gateway with this name already exists." });
      return;
    }

    const relayName = relay?.id === "_auto" ? undefined : relay?.name;

    try {
      const gateway = await createGateway({ name, relayName });
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

      <Controller
        control={control}
        name="relay"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Relay"
            tooltipText="The relay to use with your gateway."
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <FilterableSelect
              value={field.value}
              onChange={(newValue) => {
                if ((newValue as SingleValue<{ id: string }>)?.id === "_create") {
                  navigate({
                    search: (prev) => ({ ...prev, selectedTab: "relays", action: "deploy-relay" })
                  });
                  return;
                }
                field.onChange(newValue);
              }}
              isLoading={isRelaysLoading}
              options={[
                { id: "_auto", name: "Auto Select Relay" },
                { id: "_create", name: "Deploy New Relay" },
                ...(relays || [])
              ]}
              placeholder="Select relay..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: RelayOption }}
            />
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
