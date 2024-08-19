import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum AuthProvider {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  GOOGLE_SAML = "google-saml"
}

const ssoAuthProviders = [
  { label: "Okta SAML", value: AuthProvider.OKTA_SAML },
  { label: "Azure SAML", value: AuthProvider.AZURE_SAML },
  { label: "JumpCloud SAML", value: AuthProvider.JUMPCLOUD_SAML },
  { label: "Keycloak SAML", value: AuthProvider.KEYCLOAK_SAML },
  { label: "Google SAML", value: AuthProvider.GOOGLE_SAML }
];

const schema = z
  .object({
    authProvider: z.string().min(1, "SSO Type is required"),
    entryPoint: z.string().default(""),
    issuer: z.string().default(""),
    cert: z.string().default("")
  })
  .required();

export type AddSSOFormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addSSO"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addSSO"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addSSO"]>, state?: boolean) => void;
  hideDelete?: boolean;
};

export const SSOModal = ({ popUp, handlePopUpClose, handlePopUpToggle, hideDelete }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isLoading: createIsLoading } = useCreateSSOConfig();
  const { mutateAsync: updateMutateAsync, isLoading: updateIsLoading } = useUpdateSSOConfig();
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useToggle();
  const { data } = useGetSSOConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, watch, setValue, getValues } = useForm<AddSSOFormData>({
    defaultValues: {
      authProvider: AuthProvider.OKTA_SAML
    },
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (data) {
      reset({
        authProvider: data?.authProvider ?? "",
        entryPoint: data?.entryPoint ?? "",
        issuer: data?.issuer ?? "",
        cert: data?.cert ?? ""
      });
    }
  }, [data]);

  const handleSamlSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
    try {
      await updateMutateAsync({
        organizationId: currentOrg.id,
        isActive: false,
        entryPoint: "",
        issuer: "",
        cert: ""
      });

      createNotification({
        text: "Successfully deleted SAML SSO configuration.",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: "Failed deleting SAML SSO configuration.",
        type: "error"
      });
    }
  };

  const onSSOModalSubmit = async ({ authProvider, entryPoint, issuer, cert }: AddSSOFormData) => {
    try {
      if (!currentOrg) return;

      if (!data) {
        await createMutateAsync({
          organizationId: currentOrg.id,
          authProvider,
          isActive: false,
          entryPoint,
          issuer,
          cert
        });
      } else {
        await updateMutateAsync({
          organizationId: currentOrg.id,
          authProvider,
          isActive: false,
          entryPoint,
          issuer,
          cert
        });
      }

      handlePopUpClose("addSSO");

      createNotification({
        text: `Successfully ${!data ? "added" : "updated"} SAML SSO configuration`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${!data ? "add" : "update"} SAML SSO configuration`,
        type: "error"
      });
    }
  };

  const renderLabels = (authProvider: string) => {
    switch (authProvider) {
      case AuthProvider.OKTA_SAML:
        return {
          acsUrl: "Single sign-on URL",
          entityId: "Audience URI (SP Entity ID)",
          entryPoint: "Identity Provider Single Sign-On URL",
          entryPointPlaceholder: "https://your-domain.okta.com/app/app-name/xxx/sso/saml",
          issuer: "Identity Provider Issuer",
          issuerPlaceholder: "http://www.okta.com/xxx"
        };
      case AuthProvider.AZURE_SAML:
        return {
          acsUrl: "Reply URL (Assertion Consumer Service URL)",
          entityId: "Identifier (Entity ID)",
          entryPoint: "Login URL",
          entryPointPlaceholder: "https://login.microsoftonline.com/xxx/saml2",
          issuer: "Azure Application ID",
          issuerPlaceholder: "abc-def-ghi-jkl-mno"
        };
      case AuthProvider.JUMPCLOUD_SAML:
        return {
          acsUrl: "ACS URL",
          entityId: "SP Entity ID",
          entryPoint: "IDP URL",
          entryPointPlaceholder: "https://sso.jumpcloud.com/saml2/xxx",
          issuer: "IdP Entity ID",
          issuerPlaceholder: "xxx"
        };
      case AuthProvider.KEYCLOAK_SAML:
        return {
          acsUrl: "Valid redirect URI",
          entityId: "SP Entity ID",
          entryPoint: "IDP URL",
          entryPointPlaceholder: "https://keycloak.mysite.com/realms/myrealm/protocol/saml",
          issuer: "Client ID",
          issuerPlaceholder: window.origin
        };
      case AuthProvider.GOOGLE_SAML:
        return {
          acsUrl: "ACS URL",
          entityId: "SP Entity ID",
          entryPoint: "SSO URL",
          entryPointPlaceholder: "https://accounts.google.com/o/saml2/idp?idpid=xxx",
          issuer: "Issuer",
          issuerPlaceholder: window.origin
        };
      default:
        return {
          acsUrl: "ACS URL",
          entityId: "Entity ID",
          entryPoint: "Entrypoint",
          entryPointPlaceholder: "Enter entrypoint...",
          issuer: "Issuer",
          issuerPlaceholder: "Enter placeholder..."
        };
    }
  };

  const authProvider = watch("authProvider");
  useEffect(() => {
    if (authProvider === AuthProvider.GOOGLE_SAML && getValues("issuer") === "") {
      setValue("issuer", window.origin);
    }
  }, [authProvider]);

  return (
    <>
      <Modal
        isOpen={popUp?.addSSO?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addSSO", isOpen);
          reset();
        }}
      >
        <ModalContent title="Manage SAML configuration">
          <form onSubmit={handleSubmit(onSSOModalSubmit)}>
            <Controller
              control={control}
              name="authProvider"
              defaultValue="okta-saml"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Type" errorText={error?.message} isError={Boolean(error)}>
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {ssoAuthProviders.map(({ label, value }) => (
                      <SelectItem value={String(value || "")} key={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            {authProvider && data && (
              <>
                <div className="mb-4">
                  <h3 className="text-sm text-mineshaft-400">
                    {renderLabels(authProvider).acsUrl}
                  </h3>
                  <p className="text-md break-all text-gray-400">{`${window.origin}/api/v1/sso/saml2/${data.id}`}</p>
                </div>
                <div className="mb-4">
                  <h3 className="text-sm text-mineshaft-400">
                    {renderLabels(authProvider).entityId}
                  </h3>
                  <p className="text-md text-gray-400">{window.origin}</p>
                </div>
                <Controller
                  control={control}
                  name="entryPoint"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label={renderLabels(authProvider).entryPoint}
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input
                        {...field}
                        placeholder={renderLabels(authProvider).entryPointPlaceholder}
                      />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="issuer"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label={renderLabels(authProvider).issuer}
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input
                        {...field}
                        placeholder={renderLabels(authProvider).issuerPlaceholder}
                      />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="cert"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Certificate"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                    </FormControl>
                  )}
                />
              </>
            )}

            <div className="mt-8 flex justify-between">
              <div className="flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isLoading={createIsLoading || updateIsLoading}
                >
                  {!data ? "Add" : "Update"}
                </Button>
                <Button
                  colorSchema="secondary"
                  variant="plain"
                  onClick={() => handlePopUpClose("addSSO")}
                >
                  Cancel
                </Button>
              </div>
              {!hideDelete && (
                <Button colorSchema="danger" onClick={() => setIsDeletePopupOpen.on()}>
                  Delete
                </Button>
              )}
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={isDeletePopupOpen}
        title="Are you sure want to delete SAML SSO?"
        onChange={() => setIsDeletePopupOpen.toggle()}
        deleteKey="confirm"
        onDeleteApproved={handleSamlSoftDelete}
      />
    </>
  );
};
