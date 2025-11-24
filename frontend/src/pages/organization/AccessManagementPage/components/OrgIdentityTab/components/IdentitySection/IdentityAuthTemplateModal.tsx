import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
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
  const { currentOrg } = useOrganization();
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

  return (
    <Modal
      isOpen={popUp.createTemplate.isOpen || popUp.editTemplate.isOpen}
      onOpenChange={handleClose}
    >
      <ModalContent
        title={
          isEdit ? "Edit Machine Identity Auth Template" : "Create Machine Identity Auth Template"
        }
        subTitle={
          isEdit ? "Update the authentication template" : "Create a new authentication template"
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Template Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My Template" />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="method"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Authentication Method"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Select
                  {...field}
                  className="w-full"
                  position="popper"
                  placeholder="Select auth method..."
                  dropdownContainerClassName="max-w-none"
                  onValueChange={(value) => field.onChange(value)}
                >
                  {authMethods.map(({ label, value }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          {/* LDAP Configuration Fields */}
          {selectedMethod === "ldap" && (
            <>
              <Controller
                control={control}
                name="url"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="LDAP URL"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="ldaps://domain-or-ip:636" type="text" />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="bindDN"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Bind DN"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="cn=infisical,ou=Users,dc=example,dc=com" />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="bindPass"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Bind Pass"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="********" type="password" />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="searchBase"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Search Base / DN"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="ou=machines,dc=acme,dc=com" />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="ldapCaCertificate"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="CA Certificate"
                    isOptional
                    errorText={error?.message}
                    isError={Boolean(error)}
                    tooltipText="An optional PEM-encoded CA cert for the LDAP server. This is used by the TLS client for secure communication with the LDAP server."
                  >
                    <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                  </FormControl>
                )}
              />
            </>
          )}

          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {isEdit ? "Update Template" : "Create Template"}
            </Button>
            <Button colorSchema="secondary" variant="plain" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
