import { type ComponentProps, useEffect } from "react";
import {
  Controller,
  type ControllerRenderProps,
  type FieldError as ReactHookFormFieldError,
  useForm
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircleIcon, InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  GatewayPicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { superRefineKubernetesConnectionFields } from "@app/helpers/identityAuthSchemas";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/hooks/api/identities/types";
import {
  type IdentityAuthTemplate,
  type KubernetesTemplateFields,
  type LdapTemplateFields,
  MachineIdentityAuthMethod,
  useCreateIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate
} from "@app/hooks/api/identityAuthTemplates";
import { UsePopUpState } from "@app/hooks/usePopUp";

const authMethods = [
  { label: "LDAP Auth", value: MachineIdentityAuthMethod.LDAP },
  { label: "Kubernetes Auth", value: MachineIdentityAuthMethod.KUBERNETES }
];

const schema = z
  .object({
    name: z.string().min(1, "Template name is required"),
    method: z.nativeEnum(MachineIdentityAuthMethod),
    // secrets (bindPass, tokenReviewerJwt) are write-only: reads never return them, so in
    // edit mode an empty field means "keep the stored value"
    isEdit: z.boolean().default(false),
    url: z.string().optional(),
    bindDN: z.string().optional(),
    bindPass: z.string().optional(),
    searchBase: z.string().optional(),
    ldapCaCertificate: z
      .string()
      .optional()
      .transform((val) => val || undefined),
    tokenReviewMode: z
      .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
      .default(IdentityKubernetesAuthTokenReviewMode.Api),
    kubernetesHost: z.string().optional(),
    tokenReviewerJwt: z.string().optional(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable(),
    caCert: z.string().optional(),
    verifyTlsCertificate: z.boolean().default(true),
    allowedAudience: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.method === MachineIdentityAuthMethod.LDAP) {
      if (!data.url) {
        ctx.addIssue({
          path: ["url"],
          code: z.ZodIssueCode.custom,
          message: "LDAP URL is required"
        });
      }
      if (!data.bindDN) {
        ctx.addIssue({
          path: ["bindDN"],
          code: z.ZodIssueCode.custom,
          message: "Bind DN is required"
        });
      }
      if (!data.bindPass && !data.isEdit) {
        ctx.addIssue({
          path: ["bindPass"],
          code: z.ZodIssueCode.custom,
          message: "Bind Pass is required"
        });
      }
      if (!data.searchBase) {
        ctx.addIssue({
          path: ["searchBase"],
          code: z.ZodIssueCode.custom,
          message: "Search Base / DN is required"
        });
      }
      return;
    }

    superRefineKubernetesConnectionFields(data, ctx);
  });

export type FormData = z.infer<typeof schema>;

const emptyFormValues: FormData = {
  name: "",
  method: MachineIdentityAuthMethod.LDAP,
  isEdit: false,
  url: "",
  bindDN: "",
  bindPass: "",
  searchBase: "",
  ldapCaCertificate: "",
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
  kubernetesHost: "",
  tokenReviewerJwt: "",
  gatewayId: null,
  gatewayPoolId: null,
  caCert: "",
  verifyTlsCertificate: true,
  allowedAudience: ""
};

type Props = {
  popUp: UsePopUpState<["createTemplate", "editTemplate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createTemplate", "editTemplate"]>,
    state?: boolean
  ) => void;
};

export const IdentityAuthTemplateModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { mutateAsync: createTemplate } = useCreateIdentityAuthTemplate();
  const { mutateAsync: updateTemplate } = useUpdateIdentityAuthTemplate();

  const isEdit = popUp.editTemplate.isOpen;
  const template = popUp.editTemplate?.data?.template as IdentityAuthTemplate | undefined;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: emptyFormValues
  });

  useEffect(() => {
    if (isEdit && template) {
      if (template.authMethod === MachineIdentityAuthMethod.KUBERNETES) {
        const fields = template.templateFields;
        reset({
          ...emptyFormValues,
          name: template.name || "",
          method: MachineIdentityAuthMethod.KUBERNETES,
          isEdit: true,
          tokenReviewMode: fields?.tokenReviewMode || IdentityKubernetesAuthTokenReviewMode.Api,
          kubernetesHost: fields?.kubernetesHost || "",
          // write-only secret: never returned by the API, so edit starts blank (blank = keep)
          tokenReviewerJwt: "",
          gatewayId: fields?.gatewayId || null,
          gatewayPoolId: fields?.gatewayPoolId || null,
          caCert: fields?.caCert || "",
          verifyTlsCertificate: fields?.verifyTlsCertificate ?? Boolean(fields?.caCert),
          allowedAudience: fields?.allowedAudience || ""
        });
      } else {
        reset({
          ...emptyFormValues,
          name: template.name || "",
          method: MachineIdentityAuthMethod.LDAP,
          isEdit: true,
          url: template.templateFields?.url || "",
          bindDN: template.templateFields?.bindDN || "",
          // write-only secret: never returned by the API, so edit starts blank (blank = keep)
          bindPass: "",
          searchBase: template.templateFields?.searchBase || "",
          ldapCaCertificate: template.templateFields?.ldapCaCertificate || ""
        });
      }
    } else {
      reset(emptyFormValues);
    }
  }, [isEdit, template, reset]);

  const selectedMethod = watch("method");
  const tokenReviewMode = watch("tokenReviewMode");

  const onFormSubmit = async (data: FormData) => {
    const isApiMode = data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api;
    const templateFields: LdapTemplateFields | KubernetesTemplateFields =
      data.method === MachineIdentityAuthMethod.LDAP
        ? {
            url: data.url || "",
            bindDN: data.bindDN || "",
            bindPass: data.bindPass || "",
            searchBase: data.searchBase || "",
            // send an explicit empty string so clearing the field persists through the
            // merge-on-update semantics (an absent key means "keep the stored value")
            ldapCaCertificate: data.ldapCaCertificate || ""
          }
        : ({
            tokenReviewMode: data.tokenReviewMode,
            kubernetesHost: isApiMode ? data.kubernetesHost || null : null,
            caCert: isApiMode ? data.caCert || "" : "",
            verifyTlsCertificate: isApiMode
              ? Boolean(data.caCert) || data.verifyTlsCertificate
              : false,
            tokenReviewerJwt: isApiMode ? data.tokenReviewerJwt || "" : "",
            gatewayId: data.gatewayPoolId ? null : data.gatewayId || null,
            gatewayPoolId: data.gatewayPoolId || null,
            allowedAudience: data.allowedAudience || ""
          } satisfies KubernetesTemplateFields);

    if (isEdit && template) {
      // secrets are write-only, so an empty field on edit means "keep the stored value"
      // and the key must be omitted from the patch (an explicit "" would clear it and
      // propagate the cleared credential to every linked identity)
      const patchFields: Partial<LdapTemplateFields> | Partial<KubernetesTemplateFields> = {
        ...templateFields
      };
      if (data.method === MachineIdentityAuthMethod.LDAP && !data.bindPass) {
        delete (patchFields as Partial<LdapTemplateFields>).bindPass;
      }
      if (
        data.method === MachineIdentityAuthMethod.KUBERNETES &&
        isApiMode &&
        !data.tokenReviewerJwt
      ) {
        delete (patchFields as Partial<KubernetesTemplateFields>).tokenReviewerJwt;
      }
      await updateTemplate({
        templateId: template.id,
        organizationId: orgId,
        name: data.name,
        templateFields: patchFields
      });
      createNotification({
        text: "Successfully updated auth template",
        type: "success"
      });
    } else {
      await createTemplate({
        organizationId: orgId,
        name: data.name,
        authMethod: data.method,
        templateFields
      });
      createNotification({
        text: "Successfully created auth template",
        type: "success"
      });
    }

    handlePopUpToggle(isEdit ? "editTemplate" : "createTemplate", false);
    reset();
  };

  const handleClose = () => {
    handlePopUpToggle(isEdit ? "editTemplate" : "createTemplate", false);
    reset();
  };

  const renderField = <
    TName extends
      | "name"
      | "url"
      | "bindDN"
      | "bindPass"
      | "searchBase"
      | "kubernetesHost"
      | "tokenReviewerJwt"
      | "allowedAudience"
  >(
    id: string,
    label: string,
    field: ControllerRenderProps<FormData, TName>,
    error: ReactHookFormFieldError | undefined,
    inputProps?: ComponentProps<typeof Input>
  ) => (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input {...field} {...inputProps} id={id} aria-invalid={Boolean(error)} />
      <FieldError errors={[error]} />
    </Field>
  );

  return (
    <Sheet
      open={popUp.createTemplate.isOpen || popUp.editTemplate.isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? "Edit Machine Identity Auth Template"
              : "Create Machine Identity Auth Template"}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the authentication template" : "Create a new authentication template"}
          </SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onFormSubmit)}>
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto p-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) =>
                renderField("identity-auth-template-name", "Template Name", field, error, {
                  placeholder: "My Template"
                })
              }
            />

            <Controller
              control={control}
              name="method"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="identity-auth-template-method">
                    Authentication Method
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                    <SelectTrigger
                      id="identity-auth-template-method"
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select auth method..." />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {authMethods.map(({ label, value }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            {selectedMethod === MachineIdentityAuthMethod.LDAP && (
              <>
                <Controller
                  control={control}
                  name="url"
                  render={({ field, fieldState: { error } }) =>
                    renderField("identity-auth-template-url", "LDAP URL", field, error, {
                      placeholder: "ldaps://domain-or-ip:636"
                    })
                  }
                />

                <Controller
                  control={control}
                  name="bindDN"
                  render={({ field, fieldState: { error } }) =>
                    renderField("identity-auth-template-bind-dn", "Bind DN", field, error, {
                      placeholder: "cn=infisical,ou=Users,dc=example,dc=com"
                    })
                  }
                />

                <Controller
                  control={control}
                  name="bindPass"
                  render={({ field, fieldState: { error } }) =>
                    renderField("identity-auth-template-bind-pass", "Bind Pass", field, error, {
                      placeholder: isEdit ? "Leave blank to keep the current value" : "********",
                      type: "password"
                    })
                  }
                />

                <Controller
                  control={control}
                  name="searchBase"
                  render={({ field, fieldState: { error } }) =>
                    renderField(
                      "identity-auth-template-search-base",
                      "Search Base / DN",
                      field,
                      error,
                      { placeholder: "ou=machines,dc=acme,dc=com" }
                    )
                  }
                />

                <Controller
                  control={control}
                  name="ldapCaCertificate"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="identity-auth-template-ca-certificate">
                        CA Certificate (optional)
                      </FieldLabel>
                      <TextArea
                        {...field}
                        id="identity-auth-template-ca-certificate"
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        aria-invalid={Boolean(error)}
                        aria-describedby="identity-auth-template-ca-certificate-description"
                      />
                      <p
                        id="identity-auth-template-ca-certificate-description"
                        className="text-xs text-muted"
                      >
                        An optional PEM-encoded CA certificate used by the TLS client for secure
                        communication with the LDAP server.
                      </p>
                      <FieldError errors={[error]} />
                    </Field>
                  )}
                />
              </>
            )}

            {selectedMethod === MachineIdentityAuthMethod.KUBERNETES && (
              <>
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.AttachGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => (
                    <Controller
                      control={control}
                      name="gatewayId"
                      render={({ fieldState: { error } }) => {
                        const gatewayIdVal = watch("gatewayId");
                        const gatewayPoolIdVal = watch("gatewayPoolId");

                        return (
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="identity-auth-template-gateway">
                              Gateway (optional)
                            </FieldLabel>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <GatewayPicker
                                    value={{
                                      gatewayId: gatewayIdVal || null,
                                      gatewayPoolId: gatewayPoolIdVal || null
                                    }}
                                    onChange={({ gatewayId: gwId, gatewayPoolId: poolId }) => {
                                      setValue("gatewayId", gwId, { shouldDirty: true });
                                      setValue("gatewayPoolId", poolId, { shouldDirty: true });
                                      if (!gwId && !poolId) {
                                        setValue(
                                          "tokenReviewMode",
                                          IdentityKubernetesAuthTokenReviewMode.Api,
                                          { shouldDirty: true, shouldTouch: true }
                                        );
                                      }
                                    }}
                                    isDisabled={!isAllowed}
                                    className="w-full"
                                  />
                                </div>
                              </TooltipTrigger>
                              {!isAllowed && (
                                <TooltipContent className="max-w-md">
                                  Restricted access. You don&apos;t have permission to attach
                                  gateways to resources.
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <FieldError>{error?.message}</FieldError>
                          </Field>
                        );
                      }}
                    />
                  )}
                </OrgPermissionCan>

                <Controller
                  control={control}
                  name="tokenReviewMode"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel
                        htmlFor="identity-auth-template-token-review-mode"
                        className="inline-flex items-center gap-1.5"
                      >
                        Review Mode
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="size-3.5 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            The method of which tokens are reviewed. If you select Gateway as
                            Reviewer, the selected gateway will be used to review tokens with. If
                            this option is enabled, the gateway must be deployed in Kubernetes, and
                            the gateway must have the system:auth-delegator ClusterRole binding.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="identity-auth-template-token-review-mode"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select review mode" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value="gateway">Gateway as Reviewer</SelectItem>
                          <SelectItem value="api">Manual Token Reviewer JWT (API)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldError errors={[error]} />
                    </Field>
                  )}
                />

                {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
                  <>
                    <Controller
                      control={control}
                      name="kubernetesHost"
                      render={({ field, fieldState: { error } }) =>
                        renderField(
                          "identity-auth-template-kubernetes-host",
                          "Kubernetes Host / Base Kubernetes API URL",
                          field,
                          error,
                          {
                            placeholder: "https://my-example-k8s-api-host.com",
                            autoComplete: "off"
                          }
                        )
                      }
                    />

                    <Controller
                      control={control}
                      name="tokenReviewerJwt"
                      render={({ field, fieldState: { error } }) =>
                        renderField(
                          "identity-auth-template-token-reviewer-jwt",
                          "Token Reviewer JWT (optional)",
                          field,
                          error,
                          {
                            placeholder: isEdit
                              ? "Leave blank to keep the current value"
                              : "eyJhbGciOiJSUzI1NiIs...",
                            type: "password",
                            autoComplete: "new-password"
                          }
                        )
                      }
                    />
                  </>
                )}

                <Controller
                  control={control}
                  name="allowedAudience"
                  render={({ field, fieldState: { error } }) =>
                    renderField(
                      "identity-auth-template-allowed-audience",
                      "Allowed Audience (optional)",
                      field,
                      error,
                      { placeholder: "https://kubernetes.default.svc" }
                    )
                  }
                />

                {tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && (
                  <>
                    <Controller
                      control={control}
                      name="verifyTlsCertificate"
                      render={({ field: { value, onChange }, fieldState: { error } }) => {
                        const hasCaCert = Boolean(watch("caCert")?.length);
                        return (
                          <Field data-invalid={Boolean(error)}>
                            <div className="flex items-center gap-2">
                              <Switch
                                id="identity-auth-template-verify-tls"
                                checked={hasCaCert ? true : value}
                                onCheckedChange={onChange}
                                disabled={hasCaCert}
                              />
                              <FieldLabel
                                htmlFor="identity-auth-template-verify-tls"
                                className="mb-0 inline-flex items-center gap-1.5"
                              >
                                Verify TLS Certificate
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircleIcon className="size-3.5 text-muted" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-md">
                                    {hasCaCert
                                      ? "Verification is always on while a CA certificate is provided. To disable verification, clear the CA certificate field below."
                                      : "When enabled, Infisical validates the Kubernetes API server's TLS certificate against the CA certificate provided below."}
                                  </TooltipContent>
                                </Tooltip>
                              </FieldLabel>
                            </div>
                            <FieldError errors={[error]} />
                          </Field>
                        );
                      }}
                    />

                    <Controller
                      control={control}
                      name="caCert"
                      render={({ field, fieldState: { error } }) => {
                        const verifyTlsCertificate = watch("verifyTlsCertificate");
                        return (
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="identity-auth-template-k8s-ca-certificate">
                              CA Certificate
                            </FieldLabel>
                            <TextArea
                              {...field}
                              id="identity-auth-template-k8s-ca-certificate"
                              placeholder="-----BEGIN CERTIFICATE----- ..."
                              aria-invalid={Boolean(error)}
                              onChange={(e) => {
                                field.onChange(e);
                                if (e.target.value.length > 0 && !verifyTlsCertificate) {
                                  setValue("verifyTlsCertificate", true, {
                                    shouldDirty: true,
                                    shouldValidate: true
                                  });
                                }
                              }}
                            />
                            <FieldError errors={[error]} />
                          </Field>
                        );
                      }}
                    />
                  </>
                )}
              </>
            )}
          </FieldGroup>
          <SheetFooter className="border-t">
            <Button
              type="submit"
              variant={isSubOrganization ? "sub-org" : "org"}
              isPending={isSubmitting}
            >
              {isEdit ? "Update Template" : "Create Template"}
            </Button>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
