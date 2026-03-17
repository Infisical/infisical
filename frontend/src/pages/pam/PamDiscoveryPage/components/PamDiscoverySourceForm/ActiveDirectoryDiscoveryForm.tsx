import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Switch } from "@app/components/v2";
import { UnstableAlert, UnstableAlertDescription, UnstableAlertTitle } from "@app/components/v3";
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
    ldapPort: z.coerce.number().int().min(1).max(65535),
    useLdaps: z.boolean().default(false),
    winrmPort: z.coerce.number().int().min(1).max(65535),
    useWinrmHttps: z.boolean().default(false),
    discoverDependencies: z.boolean().default(false)
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
            ldapPort:
              (source.discoveryConfiguration?.ldapPort as number) ||
              (source.discoveryConfiguration?.port as number) ||
              389,
            useLdaps: Boolean(source.discoveryConfiguration?.useLdaps),
            winrmPort: (source.discoveryConfiguration?.winrmPort as number) || 5985,
            useWinrmHttps: Boolean(source.discoveryConfiguration?.useWinrmHttps),
            discoverDependencies: Boolean(source.discoveryConfiguration?.discoverDependencies)
          },
          discoveryCredentials: {
            username: (source.discoveryCredentials?.username as string) || "",
            password: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          discoveryType: PamDiscoveryType.ActiveDirectory,
          schedule: "manual",
          discoveryConfiguration: {
            domainFQDN: "",
            dcAddress: "",
            ldapPort: 389,
            useLdaps: false,
            winrmPort: 5985,
            useWinrmHttps: false,
            discoverDependencies: false
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
  const discoverDependencies = useWatch({
    control,
    name: "discoveryConfiguration.discoverDependencies"
  });

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
                tooltipText="The fully qualified domain name of the Active Directory domain (e.g. corp.example.com)"
              >
                <Input placeholder="corp.example.com" {...field} />
              </FormControl>
            )}
          />
          <Controller
            name="discoveryConfiguration.dcAddress"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="DC Address"
                tooltipText="The hostname or IP address of the Domain Controller to connect to"
              >
                <Input placeholder="dc01.corp.example.com" {...field} />
              </FormControl>
            )}
          />
          <div className="grid grid-cols-2">
            <div className="flex items-start gap-2">
              <Controller
                name="discoveryConfiguration.ldapPort"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    className="w-28"
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="LDAP Port"
                    tooltipText="The LDAP port on the Domain Controller. Default is 389 for LDAP or 636 for LDAPS"
                  >
                    <Input type="number" {...field} />
                  </FormControl>
                )}
              />
              <div className="mt-8 flex-1">
                <Controller
                  name="discoveryConfiguration.useLdaps"
                  control={control}
                  render={({ field }) => (
                    <Switch id="use-ldaps" isChecked={field.value} onCheckedChange={field.onChange}>
                      Use LDAPS
                    </Switch>
                  )}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Controller
                name="discoveryConfiguration.winrmPort"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    className="w-28"
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="WinRM Port"
                    tooltipText="The WinRM port on target machines. Default is 5985 for HTTP or 5986 for HTTPS"
                  >
                    <Input type="number" {...field} />
                  </FormControl>
                )}
              />
              <div className="mt-8 flex-1">
                <Controller
                  name="discoveryConfiguration.useWinrmHttps"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="use-winrm-https"
                      isChecked={field.value}
                      onCheckedChange={field.onChange}
                    >
                      Use HTTPS
                    </Switch>
                  )}
                />
              </div>
            </div>
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
                  tooltipText="The username of an Active Directory account with read access to query the directory"
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
                  tooltipText="The password for the Active Directory account used to authenticate with the Domain Controller"
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
        <div className="mb-4">
          <Controller
            name="discoveryConfiguration.discoverDependencies"
            control={control}
            render={({ field }) => (
              <Switch
                id="discover-dependencies"
                isChecked={field.value}
                onCheckedChange={field.onChange}
              >
                Discover Dependencies
              </Switch>
            )}
          />
          {discoverDependencies && (
            <UnstableAlert variant="org" className="mt-3">
              <TriangleAlertIcon />
              <UnstableAlertTitle>Warning</UnstableAlertTitle>
              <UnstableAlertDescription>
                When an account password is rotated, discovered Windows Services, Scheduled Tasks,
                and IIS App Pools that run under that account will have their credentials
                automatically updated to match. You can disable this per-dependency on the
                account&apos;s dependencies tab.
              </UnstableAlertDescription>
            </UnstableAlert>
          )}
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
