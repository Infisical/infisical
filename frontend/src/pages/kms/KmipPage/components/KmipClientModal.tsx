import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
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
  Input,
  TextArea
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useCreateKmipClient, useUpdateKmipClient } from "@app/hooks/api/kmip";
import { KmipPermission, TKmipClient } from "@app/hooks/api/kmip/types";

const KMIP_PERMISSIONS_OPTIONS = [
  { value: KmipPermission.Check, label: "Check" },
  { value: KmipPermission.Create, label: "Create" },
  { value: KmipPermission.Get, label: "Get" },
  { value: KmipPermission.Locate, label: "Locate" },
  { value: KmipPermission.Destroy, label: "Destroy" },
  { value: KmipPermission.Activate, label: "Activate" },
  { value: KmipPermission.Revoke, label: "Revoke" },
  { value: KmipPermission.GetAttributes, label: "Get Attributes" },
  { value: KmipPermission.Register, label: "Register" }
] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().max(500).optional(),
  permissions: z.object({
    [KmipPermission.Check]: z.boolean().optional(),
    [KmipPermission.Create]: z.boolean().optional(),
    [KmipPermission.Get]: z.boolean().optional(),
    [KmipPermission.Locate]: z.boolean().optional(),
    [KmipPermission.Destroy]: z.boolean().optional(),
    [KmipPermission.Activate]: z.boolean().optional(),
    [KmipPermission.GetAttributes]: z.boolean().optional(),
    [KmipPermission.Revoke]: z.boolean().optional(),
    [KmipPermission.Register]: z.boolean().optional()
  })
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipClient?: TKmipClient | null;
};

type FormProps = Pick<Props, "kmipClient"> & {
  onComplete: () => void;
};

const KmipClientForm = ({ onComplete, kmipClient }: FormProps) => {
  const createKmipClient = useCreateKmipClient();
  const updateKmipClient = useUpdateKmipClient();
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const isUpdate = !!kmipClient;

  const {
    control,
    handleSubmit,
    register,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: kmipClient?.name,
      description: kmipClient?.description,
      permissions: Object.fromEntries((kmipClient?.permissions || []).map((name) => [name, true]))
    }
  });

  const handleKmipClientSubmit = async ({ permissions, name, description }: FormData) => {
    const mutation = isUpdate
      ? updateKmipClient.mutateAsync({
          id: kmipClient.id,
          projectId,
          name,
          description,
          permissions: Object.entries(permissions)
            .filter(([, value]) => value)
            .map(([key]) => key as KmipPermission)
        })
      : createKmipClient.mutateAsync({
          projectId,
          name,
          description,
          permissions: Object.entries(permissions)
            .filter(([, value]) => value)
            .map(([key]) => key as KmipPermission)
        });

    await mutation;
    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "added"} KMIP client`,
      type: "success"
    });
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit(handleKmipClientSubmit)} className="flex flex-col gap-4">
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="kmip-client-name">
          Name{" "}
          <span aria-hidden className="text-danger">
            *
          </span>
        </FieldLabel>
        <Input
          id="kmip-client-name"
          autoFocus
          placeholder="My KMIP Client"
          {...register("name")}
          autoComplete="off"
          aria-required
          isError={Boolean(errors.name)}
        />
        <FieldError>{errors.name?.message}</FieldError>
      </Field>
      <Field data-invalid={Boolean(errors.description)}>
        <FieldLabel htmlFor="kmip-client-description">Description (optional)</FieldLabel>
        <TextArea
          id="kmip-client-description"
          {...register("description")}
          isError={Boolean(errors.description)}
        />
        <FieldError>{errors.description?.message}</FieldError>
      </Field>
      <Controller
        control={control}
        name="permissions"
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          return (
            <Field data-invalid={Boolean(error)}>
              <span id="kmip-client-permissions-label" className="text-sm font-medium text-accent">
                Permissions
              </span>
              <div
                role="group"
                aria-labelledby="kmip-client-permissions-label"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {KMIP_PERMISSIONS_OPTIONS.map(({ label, value: optionValue }) => {
                  return (
                    <label
                      htmlFor={`kmip-client-${optionValue}`}
                      key={optionValue}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <Checkbox
                        id={`kmip-client-${optionValue}`}
                        variant="project"
                        isChecked={value[optionValue]}
                        onCheckedChange={(state) => {
                          onChange({
                            ...value,
                            [optionValue]: state === true
                          });
                        }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
              <FieldError>{error?.message}</FieldError>
            </Field>
          );
        }}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="project" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          {isUpdate ? "Update" : "Add"} KMIP Client
        </Button>
      </DialogFooter>
    </form>
  );
};

export const KmipClientModal = ({ isOpen, onOpenChange, kmipClient }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kmipClient ? "Update" : "Add"} KMIP Client</DialogTitle>
          <DialogDescription>
            Set the client name and the KMIP operations it can perform.
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <KmipClientForm
            key={kmipClient?.id ?? "new"}
            onComplete={() => onOpenChange(false)}
            kmipClient={kmipClient}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
