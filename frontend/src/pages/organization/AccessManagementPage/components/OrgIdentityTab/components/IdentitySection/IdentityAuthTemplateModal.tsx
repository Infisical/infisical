import { useEffect } from "react";
import type { ComponentProps } from "react";
import {
  Controller,
  type ControllerRenderProps,
  type FieldError as ReactHookFormFieldError,
  useForm
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
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
  TextArea
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  MachineIdentityAuthMethod,
  useCreateIdentityAuthTemplate,
  useUpdateIdentityAuthTemplate
} from "@app/hooks/api/identityAuthTemplates";
import { UsePopUpState } from "@app/hooks/usePopUp";

const authMethods = [{ label: "LDAP Auth", value: MachineIdentityAuthMethod.LDAP }];

const schema = z.object({
  name: z.string().min(1, "Template name is required"),
  method: z.nativeEnum(MachineIdentityAuthMethod),
  url: z.string().min(1, "LDAP URL is required"),
  bindDN: z.string().min(1, "Bind DN is required"),
  bindPass: z.string().min(1, "Bind Pass is required"),
  searchBase: z.string().min(1, "Search Base / DN is required"),
  ldapCaCertificate: z
    .string()
    .optional()
    .transform((val) => val || undefined)
});

export type FormData = z.infer<typeof schema>;

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
  const template = popUp.editTemplate?.data?.template;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      method: MachineIdentityAuthMethod.LDAP,
      url: "",
      bindDN: "",
      bindPass: "",
      searchBase: "",
      ldapCaCertificate: ""
    }
  });

  useEffect(() => {
    if (isEdit && template) {
      reset({
        name: template.name || "",
        method: MachineIdentityAuthMethod.LDAP,
        url: template.templateFields?.url || "",
        bindDN: template.templateFields?.bindDN || "",
        bindPass: template.templateFields?.bindPass || "",
        searchBase: template.templateFields?.searchBase || "",
        ldapCaCertificate: template.templateFields?.ldapCaCertificate || ""
      });
    } else {
      reset({
        name: "",
        method: MachineIdentityAuthMethod.LDAP,
        url: "",
        bindDN: "",
        bindPass: "",
        searchBase: "",
        ldapCaCertificate: ""
      });
    }
  }, [isEdit, template, reset]);

  const selectedMethod = watch("method");

  const onFormSubmit = async (data: FormData) => {
    if (isEdit && template) {
      await updateTemplate({
        templateId: template.id,
        organizationId: orgId,
        name: data.name,
        templateFields: {
          url: data.url,
          bindDN: data.bindDN,
          bindPass: data.bindPass,
          searchBase: data.searchBase,
          ldapCaCertificate: data.ldapCaCertificate
        }
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
        templateFields: {
          url: data.url,
          bindDN: data.bindDN,
          bindPass: data.bindPass,
          searchBase: data.searchBase,
          ldapCaCertificate: data.ldapCaCertificate
        }
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
    TName extends "name" | "url" | "bindDN" | "bindPass" | "searchBase"
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
            {isEdit
              ? "Update the authentication template"
              : "Create a new authentication template"}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit(onFormSubmit)}
        >
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
                  <Select value={field.value} onValueChange={field.onChange}>
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

            {selectedMethod === "ldap" && (
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
                    placeholder: "********",
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
          </FieldGroup>
          <SheetFooter className="border-t">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isSubOrganization ? "sub-org" : "org"}
              isPending={isSubmitting}
            >
              {isEdit ? "Update Template" : "Create Template"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
