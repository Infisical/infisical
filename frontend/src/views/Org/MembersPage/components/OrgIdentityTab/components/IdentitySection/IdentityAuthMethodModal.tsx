import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  UpgradePlanModal
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useDeleteIdentityAwsAuth,
  useDeleteIdentityAzureAuth,
  useDeleteIdentityGcpAuth,
  useDeleteIdentityKubernetesAuth,
  useDeleteIdentityOidcAuth,
  useDeleteIdentityTokenAuth,
  useDeleteIdentityUniversalAuth
} from "@app/hooks/api";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAwsAuthForm } from "./IdentityAwsAuthForm";
import { IdentityAzureAuthForm } from "./IdentityAzureAuthForm";
import { IdentityGcpAuthForm } from "./IdentityGcpAuthForm";
import { IdentityKubernetesAuthForm } from "./IdentityKubernetesAuthForm";
import { IdentityOidcAuthForm } from "./IdentityOidcAuthForm";
import { IdentityTokenAuthForm } from "./IdentityTokenAuthForm";
import { IdentityUniversalAuthForm } from "./IdentityUniversalAuthForm";

type Props = {
  popUp: UsePopUpState<["identityAuthMethod", "upgradePlan", "revokeAuthMethod"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan", "revokeAuthMethod"]>,
    state?: boolean
  ) => void;
};

const identityAuthMethods = [
  { label: "Token Auth", value: IdentityAuthMethod.TOKEN_AUTH },
  { label: "Universal Auth", value: IdentityAuthMethod.UNIVERSAL_AUTH },
  { label: "Kubernetes Auth", value: IdentityAuthMethod.KUBERNETES_AUTH },
  { label: "GCP Auth", value: IdentityAuthMethod.GCP_AUTH },
  { label: "AWS Auth", value: IdentityAuthMethod.AWS_AUTH },
  { label: "Azure Auth", value: IdentityAuthMethod.AZURE_AUTH },
  { label: "OIDC Auth", value: IdentityAuthMethod.OIDC_AUTH }
];

const schema = yup
  .object({
    authMethod: yup
      .mixed<IdentityAuthMethod>()
      .oneOf(Object.values(IdentityAuthMethod))
      .required("Auth method is required")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

export const IdentityAuthMethodModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { mutateAsync: revokeUniversalAuth } = useDeleteIdentityUniversalAuth();
  const { mutateAsync: revokeTokenAuth } = useDeleteIdentityTokenAuth();
  const { mutateAsync: revokeKubernetesAuth } = useDeleteIdentityKubernetesAuth();
  const { mutateAsync: revokeGcpAuth } = useDeleteIdentityGcpAuth();
  const { mutateAsync: revokeAwsAuth } = useDeleteIdentityAwsAuth();
  const { mutateAsync: revokeAzureAuth } = useDeleteIdentityAzureAuth();
  const { mutateAsync: revokeOidcAuth } = useDeleteIdentityOidcAuth();

  const initialAuthMethod = popUp?.identityAuthMethod?.data?.authMethod;

  const { control, watch, setValue, reset } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      authMethod: initialAuthMethod
    }
  });

  useEffect(() => {
    // reset form on open
    if (popUp.identityAuthMethod.isOpen)
      reset({ authMethod: popUp?.identityAuthMethod?.data?.authMethod });
  }, [popUp.identityAuthMethod.isOpen]);

  const identityAuthMethodData = {
    identityId: popUp?.identityAuthMethod.data?.identityId,
    name: popUp?.identityAuthMethod?.data?.name,
    authMethod: watch("authMethod")
  } as {
    identityId: string;
    name: string;
    authMethod?: IdentityAuthMethod;
  };

  useEffect(() => {
    if (identityAuthMethodData?.authMethod) {
      setValue("authMethod", identityAuthMethodData.authMethod);
      return;
    }

    setValue("authMethod", IdentityAuthMethod.UNIVERSAL_AUTH);
  }, [identityAuthMethodData?.authMethod]);

  const onRevokeAuthMethodSubmit = async (authMethod: IdentityAuthMethod) => {
    if (!orgId || !authMethod) return;
    try {
      switch (authMethod) {
        case IdentityAuthMethod.UNIVERSAL_AUTH: {
          await revokeUniversalAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.TOKEN_AUTH: {
          await revokeTokenAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.KUBERNETES_AUTH: {
          await revokeKubernetesAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.GCP_AUTH: {
          await revokeGcpAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.AWS_AUTH: {
          await revokeAwsAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.AZURE_AUTH: {
          await revokeAzureAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        case IdentityAuthMethod.OIDC_AUTH: {
          await revokeOidcAuth({
            identityId: identityAuthMethodData.identityId,
            organizationId: orgId
          });
          break;
        }
        default:
          break;
      }

      createNotification({
        text: `Successfully removed ${identityAuthToNameMap[authMethod]} on ${identityAuthMethodData.name}`,
        type: "success"
      });

      handlePopUpToggle("revokeAuthMethod", false);
      handlePopUpToggle("identityAuthMethod", false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to remove ${identityAuthToNameMap[authMethod]} on ${identityAuthMethodData.name}`,
        type: "error"
      });
    }
  };
  const renderIdentityAuthForm = () => {
    switch (identityAuthMethodData.authMethod) {
      case IdentityAuthMethod.AWS_AUTH: {
        return (
          <IdentityAwsAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.KUBERNETES_AUTH: {
        return (
          <IdentityKubernetesAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.GCP_AUTH: {
        return (
          <IdentityGcpAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.AZURE_AUTH: {
        return (
          <IdentityAzureAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.UNIVERSAL_AUTH: {
        return (
          <IdentityUniversalAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.OIDC_AUTH: {
        return (
          <IdentityOidcAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      case IdentityAuthMethod.TOKEN_AUTH: {
        return (
          <IdentityTokenAuthForm
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
            identityAuthMethodData={identityAuthMethodData}
            initialAuthMethod={initialAuthMethod!}
            revokeAuth={onRevokeAuthMethodSubmit}
          />
        );
      }
      default: {
        return <div />;
      }
    }
  };

  return (
    <Modal
      isOpen={popUp?.identityAuthMethod?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identityAuthMethod", isOpen);
      }}
    >
      <ModalContent
        title={`${
          identityAuthMethodData.authMethod === initialAuthMethod ? "Update" : "Configure"
        } Identity Auth Method for ${
          identityAuthToNameMap[identityAuthMethodData.authMethod!] ?? ""
        }`}
      >
        <Controller
          control={control}
          name="authMethod"
          defaultValue={IdentityAuthMethod.UNIVERSAL_AUTH}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="Auth Method" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => {
                  onChange(e);
                }}
                className="w-full"
              >
                {identityAuthMethods.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        {renderIdentityAuthForm()}
        <UpgradePlanModal
          isOpen={popUp?.upgradePlan?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can use IP allowlisting if you switch to Infisical's Pro plan."
        />
        <DeleteActionModal
          isOpen={popUp?.revokeAuthMethod?.isOpen}
          title={`Are you sure want to remove ${
            identityAuthMethodData?.authMethod
              ? identityAuthToNameMap[identityAuthMethodData.authMethod]
              : "the auth method"
          } on ${identityAuthMethodData?.name ?? ""}?`}
          onChange={(isOpen) => handlePopUpToggle("revokeAuthMethod", isOpen)}
          deleteKey="confirm"
          buttonText="Remove"
          onDeleteApproved={() => onRevokeAuthMethodSubmit(identityAuthMethodData.authMethod!)}
        />
      </ModalContent>
    </Modal>
  );
};
