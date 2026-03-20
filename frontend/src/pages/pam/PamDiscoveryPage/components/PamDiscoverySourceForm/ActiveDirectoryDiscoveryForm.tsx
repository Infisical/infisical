import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  SheetFooter,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableInput
} from "@app/components/v3";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { PamDiscoveryType, TPamDiscoverySource } from "@app/hooks/api/pamDiscovery";

import { GenericDiscoveryFields, genericDiscoveryFieldsSchema } from "./GenericDiscoveryFields";

type Props = {
  source?: TPamDiscoverySource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericDiscoveryFieldsSchema.extend({
  discoveryType: z.literal(PamDiscoveryType.ActiveDirectory),
  discoveryConfiguration: z.object({
    domainFQDN: z.string().trim().min(1, "Domain FQDN is required").max(255),
    dcAddress: z.string().trim().min(1, "DC Address is required").max(255),
    // LDAP
    ldapPort: z.coerce.number().int().min(1).max(65535),
    useLdaps: z.boolean().default(true),
    ldapRejectUnauthorized: z.boolean().default(true),
    ldapCaCert: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional(),
    ldapTlsServerName: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional(),
    // WinRM
    winrmPort: z.coerce.number().int().min(1).max(65535),
    useWinrmHttps: z.boolean().default(true),
    winrmRejectUnauthorized: z.boolean().default(true),
    winrmCaCert: z
      .string()
      .trim()
      .transform((val) => val || undefined)
      .optional(),
    // Dependencies
    discoverDependencies: z.boolean().default(false)
  }),
  discoveryCredentials: z.object({
    username: z.string().trim().min(1, "Username is required").max(255),
    password: z.string().max(255)
  })
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryDiscoveryForm = ({ source, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(source);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: source
      ? {
          discoveryType: PamDiscoveryType.ActiveDirectory,
          name: source.name,
          gateway: source.gatewayId ? { id: source.gatewayId, name: "" } : undefined,
          schedule: source.schedule || "manual",
          discoveryConfiguration: {
            domainFQDN: (source.discoveryConfiguration?.domainFQDN as string) || "",
            dcAddress: (source.discoveryConfiguration?.dcAddress as string) || "",
            ldapPort:
              (source.discoveryConfiguration?.ldapPort as number) ||
              (source.discoveryConfiguration?.port as number) ||
              636,
            useLdaps: source.discoveryConfiguration?.useLdaps !== false,
            ldapRejectUnauthorized: source.discoveryConfiguration?.ldapRejectUnauthorized !== false,
            ldapCaCert:
              (source.discoveryConfiguration?.ldapCaCert as string) ||
              (source.discoveryConfiguration?.caCert as string) ||
              "",
            ldapTlsServerName: (source.discoveryConfiguration?.ldapTlsServerName as string) || "",
            winrmPort: (source.discoveryConfiguration?.winrmPort as number) || 5986,
            useWinrmHttps: source.discoveryConfiguration?.useWinrmHttps !== false,
            winrmRejectUnauthorized:
              source.discoveryConfiguration?.winrmRejectUnauthorized !== false,
            winrmCaCert:
              (source.discoveryConfiguration?.winrmCaCert as string) ||
              (source.discoveryConfiguration?.caCert as string) ||
              "",
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
          gateway: undefined,
          discoveryConfiguration: {
            domainFQDN: "",
            dcAddress: "",
            ldapPort: 636,
            useLdaps: true,
            ldapRejectUnauthorized: true,
            ldapCaCert: "",
            ldapTlsServerName: "",
            winrmPort: 5986,
            useWinrmHttps: true,
            winrmRejectUnauthorized: true,
            winrmCaCert: "",
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
  const useLdaps = useWatch({ control, name: "discoveryConfiguration.useLdaps" });
  const ldapRejectUnauthorized = useWatch({
    control,
    name: "discoveryConfiguration.ldapRejectUnauthorized"
  });
  const useWinrmHttps = useWatch({ control, name: "discoveryConfiguration.useWinrmHttps" });
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
      <form
        onSubmit={handleSubmit((data) => onSubmit(data as FormData))}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          {/* Generic Discovery Fields */}
          <GenericDiscoveryFields />

          {/* Connection */}
          <div className="flex flex-col gap-3">
            <Label>Connection</Label>

            <Controller
              name="discoveryConfiguration.domainFQDN"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Domain FQDN
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The fully qualified domain name of the Active Directory domain (e.g.
                        corp.example.com)
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      isError={Boolean(error)}
                      placeholder="corp.example.com"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.dcAddress"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    DC Address
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The hostname or IP address of the Domain Controller to connect to
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      isError={Boolean(error)}
                      placeholder="dc01.corp.example.com"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            {/* Username & Password */}
            <div className="grid grid-cols-2 gap-2">
              <Controller
                name="discoveryCredentials.username"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>
                      Username
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                        </TooltipTrigger>
                        <TooltipContent>
                          The username of an Active Directory account with read access to query the
                          directory
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <FieldContent>
                      <UnstableInput
                        {...field}
                        placeholder="Administrator"
                        isError={Boolean(error)}
                        autoComplete="off"
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              <Controller
                name="discoveryCredentials.password"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>
                      Password
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                        </TooltipTrigger>
                        <TooltipContent>
                          The password for the Active Directory account used to authenticate with
                          the Domain Controller
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <FieldContent>
                      <UnstableInput
                        {...field}
                        placeholder="••••••"
                        isError={Boolean(error)}
                        autoComplete="new-password"
                        type={showPassword ? "text" : "password"}
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
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>

            {/* Discover Dependencies */}
            <Controller
              name="discoveryConfiguration.discoverDependencies"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Discover Dependencies</FieldLabel>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            {discoverDependencies && (
              <UnstableAlert variant="info">
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

          {/* LDAP Configuration */}
          <div className="flex flex-col gap-3">
            <Label>LDAP</Label>

            <Controller
              name="discoveryConfiguration.ldapPort"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Port
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The LDAP port on the Domain Controller. Default is 389 for LDAP or 636 for
                        LDAPS
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      type="number"
                      placeholder="636"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.useLdaps"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Enable LDAPS</FieldLabel>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.ldapCaCert"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>CA Certificate</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      className="max-h-32"
                      disabled={!useLdaps}
                      placeholder="-----BEGIN CERTIFICATE-----..."
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.ldapRejectUnauthorized"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>
                    Reject Unauthorized
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        If enabled, Infisical will only connect to the Domain Controller if it has a
                        valid, trusted TLS certificate
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Switch
                    variant="project"
                    disabled={!useLdaps}
                    checked={useLdaps ? field.value : false}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.ldapTlsServerName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    TLS Server Name
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The expected hostname in the server's TLS certificate. Required when DC
                        Address is an IP address and Reject Unauthorized is enabled.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      placeholder="dc.corp.example.com"
                      disabled={!useLdaps || !ldapRejectUnauthorized}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label>WinRM</Label>

            <Controller
              name="discoveryConfiguration.winrmPort"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Port
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The WinRM port on target machines. Default is 5985 for HTTP or 5986 for
                        HTTPS
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      type="number"
                      placeholder="5986"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.useWinrmHttps"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>Enable HTTPS</FieldLabel>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.winrmCaCert"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>CA Certificate</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      className="max-h-32"
                      disabled={!useWinrmHttps}
                      placeholder="-----BEGIN CERTIFICATE-----..."
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="discoveryConfiguration.winrmRejectUnauthorized"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal">
                  <FieldLabel>
                    Reject Unauthorized
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        If enabled, Infisical will only connect to the Domain Controller if it has a
                        valid, trusted TLS certificate
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Switch
                    variant="project"
                    disabled={!useWinrmHttps}
                    checked={useWinrmHttps ? field.value : false}
                    onCheckedChange={field.onChange}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </div>
        </div>

        {/* Sheet Footer */}
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="project"
            type="submit"
          >
            {isUpdate ? "Update Discovery Source" : "Create Discovery Source"}
          </Button>
          <Button onClick={closeSheet} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
