import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetOrgUsers } from "@app/hooks/api";
import { useRegisterEndpointDevice } from "@app/hooks/api/endpoint";

const formSchema = z.object({
  selectedOwner: z.object(
    { id: z.string(), name: z.string(), email: z.string() },
    {
      required_error: "Select the person this device belongs to"
    }
  ),
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or fewer")
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const RegisterDeviceModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const registerDevice = useRegisterEndpointDevice();

  const { data: orgUsers, isPending: isLoadingOrgUsers } = useGetOrgUsers(currentOrg.id);

  const ownerOptions = (orgUsers ?? [])
    .filter((membership) => membership.isActive && membership.user.id)
    .map((membership) => {
      const email = membership.user.email ?? membership.user.username;
      const fullName = [membership.user.firstName, membership.user.lastName]
        .filter(Boolean)
        .join(" ");

      return { id: membership.user.id, name: fullName || email, email };
    });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const onSubmit = (data: FormData) => {
    registerDevice.mutate(
      { userId: data.selectedOwner.id, name: data.name },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Device "${data.name}" registered` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Device</DialogTitle>
          <DialogDescription>
            Assign a company device to the person who uses it. The agent on the device signs in as
            them when they run{" "}
            <span className="font-mono text-xs">sudo infisical endpoint start</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Controller
            control={control}
            name="selectedOwner"
            render={({ field: { onChange, value } }) => (
              <Field>
                <FieldLabel>Assigned To</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    value={value}
                    onChange={onChange}
                    isLoading={isLoadingOrgUsers}
                    placeholder="Select a person..."
                    autoFocus
                    options={ownerOptions}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) =>
                      option.name === option.email
                        ? option.email
                        : `${option.name} (${option.email})`
                    }
                  />
                  <FieldError>{errors.selectedOwner?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="device-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="device-name"
                placeholder="e.g. jane-macbook-pro"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="endpoint" isPending={registerDevice.isPending}>
              Register Device
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
