import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { PamDiscoveryType, TPamDiscoverySource } from "@app/hooks/api/pamDiscovery";

import { GenericDiscoveryFields, genericDiscoveryFieldsSchema } from "./GenericDiscoveryFields";

type Props = {
  source?: TPamDiscoverySource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericDiscoveryFieldsSchema.extend({
  discoveryType: z.literal(PamDiscoveryType.ActiveDirectory),
  discoveryConfiguration: z.object({
    domainFQDN: z.string().trim().min(1, "Domain FQDN is required").max(255),
    dcAddress: z.string().trim().min(1, "DC Address is required").max(255),
    port: z.coerce.number().int().min(1).max(65535)
  }),
  discoveryCredentials: z.object({
    username: z.string().trim().min(1, "Username is required").max(255),
    password: z.string().max(255)
  })
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryDiscoveryForm = ({ source, onSubmit }: Props) => {
  const isUpdate = Boolean(source);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: source
      ? {
          discoveryType: PamDiscoveryType.ActiveDirectory,
          name: source.name,
          gatewayId: source.gatewayId || "",
          schedule: source.schedule || "manual",
          discoveryConfiguration: {
            domainFQDN: (source.discoveryConfiguration?.domainFQDN as string) || "",
            dcAddress: (source.discoveryConfiguration?.dcAddress as string) || "",
            port: (source.discoveryConfiguration?.port as number) || 389
          },
          discoveryCredentials: {
            username: (source.discoveryCredentials?.username as string) || "",
            password: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          discoveryType: PamDiscoveryType.ActiveDirectory,
          discoveryConfiguration: {
            domainFQDN: "",
            dcAddress: "",
            port: 389
          },
          discoveryCredentials: {
            username: "",
            password: ""
          }
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "discoveryCredentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericDiscoveryFields />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <Controller
            name="discoveryConfiguration.domainFQDN"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-3"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Domain FQDN"
              >
                <Input placeholder="corp.example.com" {...field} />
              </FormControl>
            )}
          />
          <div className="flex items-start gap-2">
            <Controller
              name="discoveryConfiguration.dcAddress"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="DC Address"
                >
                  <Input placeholder="dc01.corp.example.com" {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="discoveryConfiguration.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="w-28"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Port"
                >
                  <Input type="number" {...field} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <div className="flex items-start gap-2">
            <Controller
              name="discoveryCredentials.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Username"
                >
                  <Input placeholder="admin" autoComplete="off" {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="discoveryCredentials.password"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Password"
                >
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    onFocus={() => {
                      if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                        field.onChange("");
                      }
                      setShowPassword(true);
                    }}
                    onBlur={() => {
                      if (isUpdate && field.value === "") {
                        field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                      }
                      setShowPassword(false);
                    }}
                  />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Details" : "Create Discovery Source"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
