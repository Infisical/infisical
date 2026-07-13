import { useState } from "react";
import { Control, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input
} from "@app/components/v3";
import {
  PamDiscoverySchedule,
  PamDiscoveryType,
  useCreatePamDiscoverySource
} from "@app/hooks/api/pam";

import {
  buildDiscoveryConfiguration,
  CredentialAccountField,
  DISCOVERY_CONFIG_DEFAULTS,
  DiscoveryConfigFields,
  discoveryConfigFormShape,
  ScheduleField,
  TDiscoveryConfigFields
} from "./DiscoveryConfigFields";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  credentialAccountId: z.string().uuid("Select a credential account"),
  schedule: z.nativeEnum(PamDiscoverySchedule),
  ...discoveryConfigFormShape
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddDiscoverySourceModal = ({ isOpen, onOpenChange }: Props) => {
  const createSource = useCreatePamDiscoverySource();

  const [gateway, setGateway] = useState<{
    gatewayId: string | null;
    gatewayPoolId: string | null;
  }>({
    gatewayId: null,
    gatewayPoolId: null
  });
  const [gatewayError, setGatewayError] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      credentialAccountId: "",
      schedule: PamDiscoverySchedule.Manual,
      ...DISCOVERY_CONFIG_DEFAULTS
    }
  });

  const resetForm = () => {
    reset();
    setGateway({ gatewayId: null, gatewayPoolId: null });
    setGatewayError(false);
  };

  const onSubmit = (data: FormData) => {
    if (!gateway.gatewayId && !gateway.gatewayPoolId) {
      setGatewayError(true);
      return;
    }

    createSource.mutate(
      {
        discoveryType: PamDiscoveryType.ActiveDirectory,
        name: data.name,
        credentialAccountId: data.credentialAccountId,
        schedule: data.schedule,
        configuration: buildDiscoveryConfiguration(data),
        ...(gateway.gatewayId ? { gatewayId: gateway.gatewayId } : {}),
        ...(gateway.gatewayPoolId ? { gatewayPoolId: gateway.gatewayPoolId } : {})
      },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Discovery source created" });
          resetForm();
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Active Directory Discovery Source</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="source-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="source-name"
                placeholder="e.g. corp-active-directory"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>

          <CredentialAccountField
            control={control as unknown as Control<{ credentialAccountId: string }>}
          />

          <Field>
            <FieldLabel>Gateway</FieldLabel>
            <FieldContent>
              <GatewayPicker
                isRequired
                isError={gatewayError}
                value={gateway}
                onChange={(value) => {
                  setGateway(value);
                  setGatewayError(false);
                }}
              />
              {gatewayError && <FieldError>A gateway is required</FieldError>}
            </FieldContent>
          </Field>

          <ScheduleField
            control={control as unknown as Control<{ schedule: PamDiscoverySchedule }>}
          />

          <DiscoveryConfigFields control={control as unknown as Control<TDiscoveryConfigFields>} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="pam" isPending={createSource.isPending}>
              Add Source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
