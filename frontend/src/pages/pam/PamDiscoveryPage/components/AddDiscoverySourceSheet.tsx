import { useEffect, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  PamDiscoverySchedule,
  PamDiscoveryType,
  TPamDiscoveryTypeOption,
  useCreatePamDiscoverySource,
  useListPamDiscoveryTypes
} from "@app/hooks/api/pam";

import {
  buildDiscoveryConfiguration,
  buildUnixDiscoveryConfiguration,
  CredentialAccountField,
  DISCOVERY_CONFIG_DEFAULTS,
  DiscoveryConfigFields,
  discoveryConfigFormShape,
  ScheduleField,
  SshCredentialAccountsField,
  TDiscoveryConfigFields,
  TUnixDiscoveryConfigFields,
  UNIX_DISCOVERY_CONFIG_DEFAULTS,
  UnixDiscoveryConfigFields,
  unixDiscoveryConfigFormShape
} from "./DiscoveryConfigFields";

type FormProps = {
  onBack: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

const useGatewaySelection = () => {
  const [gateway, setGateway] = useState<{
    gatewayId: string | null;
    gatewayPoolId: string | null;
  }>({
    gatewayId: null,
    gatewayPoolId: null
  });
  const [gatewayError, setGatewayError] = useState(false);
  return { gateway, setGateway, gatewayError, setGatewayError };
};

const GatewayField = ({
  value,
  isError,
  onChange
}: {
  value: { gatewayId: string | null; gatewayPoolId: string | null };
  isError: boolean;
  onChange: (value: { gatewayId: string | null; gatewayPoolId: string | null }) => void;
}) => (
  <Field>
    <FieldLabel>Gateway</FieldLabel>
    <FieldContent>
      <GatewayPicker isRequired isError={isError} value={value} onChange={onChange} />
      {isError && <FieldError>A gateway is required</FieldError>}
    </FieldContent>
  </Field>
);

const NameField = ({ control }: { control: Control<{ name: string }> }) => (
  <Controller
    control={control}
    name="name"
    render={({ field, fieldState }) => (
      <Field>
        <FieldLabel htmlFor="source-name">Name</FieldLabel>
        <FieldContent>
          <Input
            id="source-name"
            placeholder="e.g. corp-servers"
            isError={!!fieldState.error}
            {...field}
          />
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldContent>
      </Field>
    )}
  />
);

const FormShell = ({
  children,
  footer
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) => (
  <>
    <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
      {children}
      <div aria-hidden className="h-4 shrink-0" />
    </div>
    <SheetFooter className="justify-end border-t">{footer}</SheetFooter>
  </>
);

const activeDirectorySchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  credentialAccountId: z.string().uuid("Select a credential account"),
  schedule: z.nativeEnum(PamDiscoverySchedule),
  ...discoveryConfigFormShape
});

const ActiveDirectorySourceForm = ({ onBack, onClose, onDirtyChange }: FormProps) => {
  const createSource = useCreatePamDiscoverySource();
  const { gateway, setGateway, gatewayError, setGatewayError } = useGatewaySelection();

  const {
    handleSubmit,
    control,
    formState: { isDirty }
  } = useForm<z.infer<typeof activeDirectorySchema>>({
    resolver: zodResolver(activeDirectorySchema),
    defaultValues: {
      name: "",
      credentialAccountId: "",
      schedule: PamDiscoverySchedule.Manual,
      ...DISCOVERY_CONFIG_DEFAULTS
    }
  });

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = (data: z.infer<typeof activeDirectorySchema>) => {
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
          onClose();
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <FormShell
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" variant="pam" isPending={createSource.isPending}>
              Add Source
            </Button>
          </>
        }
      >
        <NameField control={control as unknown as Control<{ name: string }>} />
        <CredentialAccountField
          control={control as unknown as Control<{ credentialAccountId: string }>}
        />
        <GatewayField
          value={gateway}
          isError={gatewayError}
          onChange={(value) => {
            setGateway(value);
            setGatewayError(false);
          }}
        />
        <ScheduleField
          control={control as unknown as Control<{ schedule: PamDiscoverySchedule }>}
        />
        <DiscoveryConfigFields control={control as unknown as Control<TDiscoveryConfigFields>} />
      </FormShell>
    </form>
  );
};

const unixSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  schedule: z.nativeEnum(PamDiscoverySchedule),
  ...unixDiscoveryConfigFormShape
});

const UnixSourceForm = ({ onBack, onClose, onDirtyChange }: FormProps) => {
  const createSource = useCreatePamDiscoverySource();
  const { gateway, setGateway, gatewayError, setGatewayError } = useGatewaySelection();

  const {
    handleSubmit,
    control,
    formState: { isDirty }
  } = useForm<z.infer<typeof unixSchema>>({
    resolver: zodResolver(unixSchema),
    defaultValues: {
      name: "",
      schedule: PamDiscoverySchedule.Manual,
      ...UNIX_DISCOVERY_CONFIG_DEFAULTS
    }
  });

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const onSubmit = (data: z.infer<typeof unixSchema>) => {
    if (!gateway.gatewayId && !gateway.gatewayPoolId) {
      setGatewayError(true);
      return;
    }
    createSource.mutate(
      {
        discoveryType: PamDiscoveryType.Unix,
        name: data.name,
        credentialAccountId: data.credentialAccountIds[0],
        schedule: data.schedule,
        configuration: buildUnixDiscoveryConfiguration(data),
        ...(gateway.gatewayId ? { gatewayId: gateway.gatewayId } : {}),
        ...(gateway.gatewayPoolId ? { gatewayPoolId: gateway.gatewayPoolId } : {})
      },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Discovery source created" });
          onClose();
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <FormShell
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" variant="pam" isPending={createSource.isPending}>
              Add Source
            </Button>
          </>
        }
      >
        <NameField control={control as unknown as Control<{ name: string }>} />
        <SshCredentialAccountsField
          control={control as unknown as Control<{ credentialAccountIds: string[] }>}
        />
        <GatewayField
          value={gateway}
          isError={gatewayError}
          onChange={(value) => {
            setGateway(value);
            setGatewayError(false);
          }}
        />
        <ScheduleField
          control={control as unknown as Control<{ schedule: PamDiscoverySchedule }>}
        />
        <UnixDiscoveryConfigFields
          control={control as unknown as Control<TUnixDiscoveryConfigFields>}
        />
      </FormShell>
    </form>
  );
};

const TypeSelectorStep = ({
  types,
  selectedType,
  onSelect,
  onCancel,
  onNext
}: {
  types: TPamDiscoveryTypeOption[];
  selectedType: PamDiscoveryType | null;
  onSelect: (type: PamDiscoveryType) => void;
  onCancel: () => void;
  onNext: () => void;
}) => (
  <>
    <div className="flex min-h-0 flex-1 flex-col px-4">
      <RadioGroup
        value={selectedType ?? ""}
        onValueChange={(value) => onSelect(value as PamDiscoveryType)}
        className="flex thin-scrollbar flex-1 flex-col gap-2 overflow-y-auto"
      >
        {types.map((type) => (
          <FieldLabel key={type.type} htmlFor={`discovery-type-${type.type}`} variant="pam">
            <Field orientation="horizontal" className="items-center gap-3">
              <img
                src={`/images/integrations/${type.icon}`}
                alt={type.name}
                className="size-7 shrink-0 rounded-sm"
              />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">{type.name}</p>
              </div>
              <RadioGroupItem
                id={`discovery-type-${type.type}`}
                value={type.type}
                className="sr-only"
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </div>

    <SheetFooter className="justify-end border-t">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" variant="pam" isDisabled={!selectedType} onClick={onNext}>
        Next
      </Button>
    </SheetFooter>
  </>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddDiscoverySourceSheet = ({ isOpen, onOpenChange }: Props) => {
  const { data: discoveryTypes = [] } = useListPamDiscoveryTypes();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<PamDiscoveryType | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedType(null);
      setIsFormDirty(false);
    }
  }, [isOpen]);

  const close = () => onOpenChange(false);

  // warn before discarding a partially filled form
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isFormDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Discovery Source</SheetTitle>
            <SheetDescription>
              Choose a source type to scan for privileged accounts in your infrastructure.
            </SheetDescription>
          </SheetHeader>

          {step === 1 && (
            <TypeSelectorStep
              types={discoveryTypes}
              selectedType={selectedType}
              onSelect={setSelectedType}
              onCancel={() => handleOpenChange(false)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 &&
            (selectedType === PamDiscoveryType.Unix ? (
              <UnixSourceForm
                onBack={() => setStep(1)}
                onClose={close}
                onDirtyChange={setIsFormDirty}
              />
            ) : (
              <ActiveDirectorySourceForm
                onBack={() => setStep(1)}
                onClose={close}
                onDirtyChange={setIsFormDirty}
              />
            ))}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard source setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress creating this discovery source will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
