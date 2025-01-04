import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  DeleteActionModal,
  FormControl,
  Select,
  SelectItem,
  Tooltip,
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
import {
  IdentityAuthMethod,
  identityAuthToNameMap,
  useDeleteIdentityJwtAuth
} from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAwsAuthForm } from "./IdentityAwsAuthForm";
import { IdentityAzureAuthForm } from "./IdentityAzureAuthForm";
import { IdentityGcpAuthForm } from "./IdentityGcpAuthForm";
import { IdentityJwtAuthForm } from "./IdentityJwtAuthForm";
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

  identity: {
    name: string;
    id: string;
    authMethods: IdentityAuthMethod[];
  };
  initialAuthMethod: IdentityAuthMethod;
  setSelectedAuthMethod: (authMethod: IdentityAuthMethod) => void;
};

type TRevokeOptions = {
  identityId: string;
  organizationId: string;
};

type TRevokeMethods = {
  revokeMethod: (revokeOptions: TRevokeOptions) => Promise<any>;
  render: () => JSX.Element;
};

const identityAuthMethods = [
  { label: "Token Auth", value: IdentityAuthMethod.TOKEN_AUTH },
  { label: "Universal Auth", value: IdentityAuthMethod.UNIVERSAL_AUTH },
  { label: "Kubernetes Auth", value: IdentityAuthMethod.KUBERNETES_AUTH },
  { label: "GCP Auth", value: IdentityAuthMethod.GCP_AUTH },
  { label: "AWS Auth", value: IdentityAuthMethod.AWS_AUTH },
  { label: "Azure Auth", value: IdentityAuthMethod.AZURE_AUTH },
  { label: "OIDC Auth", value: IdentityAuthMethod.OIDC_AUTH },
  {
    label: "JWT Auth",
    value: IdentityAuthMethod.JWT_AUTH
  }
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

export const IdentityAuthMethodModalContent = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle,
  identity,
  initialAuthMethod,
  setSelectedAuthMethod
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { mutateAsync: revokeUniversalAuth } = useDeleteIdentityUniversalAuth();
  const { mutateAsync: revokeTokenAuth } = useDeleteIdentityTokenAuth();
  const { mutateAsync: revokeKubernetesAuth } = useDeleteIdentityKubernetesAuth();
  const { mutateAsync: revokeGcpAuth } = useDeleteIdentityGcpAuth();
  const { mutateAsync: revokeAwsAuth } = useDeleteIdentityAwsAuth();
  const { mutateAsync: revokeAzureAuth } = useDeleteIdentityAzureAuth();
  const { mutateAsync: revokeOidcAuth } = useDeleteIdentityOidcAuth();
  const { mutateAsync: revokeJwtAuth } = useDeleteIdentityJwtAuth();

  const { control, watch } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: async () => {
      let authMethod = initialAuthMethod;

      if (!authMethod) {
        const firstAuthMethodNotConfiguredAuthMethod = identityAuthMethods.find(
          ({ value }) => !identity?.authMethods?.includes(value)
        );

        if (firstAuthMethodNotConfiguredAuthMethod) {
          authMethod = firstAuthMethodNotConfiguredAuthMethod.value;
        }
      }

      setSelectedAuthMethod(authMethod);
      return {
        authMethod
      };
    }
  });

  const watchedAuthMethod = watch("authMethod");

  const identityAuthMethodData = {
    identityId: identity.id,
    name: identity.name,
    authMethod: watch("authMethod"),
    configuredAuthMethods: identity.authMethods
  } as {
    identityId: string;
    name: string;
    authMethod?: IdentityAuthMethod;
    configuredAuthMethods?: IdentityAuthMethod[];
  };

  const isSelectedAuthAlreadyConfigured =
    identityAuthMethodData?.configuredAuthMethods?.includes(watchedAuthMethod);

  const methodMap: Record<IdentityAuthMethod, TRevokeMethods | undefined> = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: {
      revokeMethod: revokeUniversalAuth,
      render: () => (
        <IdentityUniversalAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.OIDC_AUTH]: {
      revokeMethod: revokeOidcAuth,
      render: () => (
        <IdentityOidcAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.TOKEN_AUTH]: {
      revokeMethod: revokeTokenAuth,
      render: () => (
        <IdentityTokenAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.AZURE_AUTH]: {
      revokeMethod: revokeAzureAuth,
      render: () => (
        <IdentityAzureAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.GCP_AUTH]: {
      revokeMethod: revokeGcpAuth,
      render: () => (
        <IdentityGcpAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.KUBERNETES_AUTH]: {
      revokeMethod: revokeKubernetesAuth,
      render: () => (
        <IdentityKubernetesAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.AWS_AUTH]: {
      revokeMethod: revokeAwsAuth,
      render: () => (
        <IdentityAwsAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.JWT_AUTH]: {
      revokeMethod: revokeJwtAuth,
      render: () => (
        <IdentityJwtAuthForm
          identityAuthMethodData={identityAuthMethodData}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    }
  };

  const isAlreadyConfigured = useCallback((method: IdentityAuthMethod) => {
    return identityAuthMethodData?.configuredAuthMethods?.includes(method);
  }, []);

  const selectedMethodItem = methodMap[identityAuthMethodData.authMethod!];

  return (
    <>
      <Controller
        control={control}
        name="authMethod"
        defaultValue={IdentityAuthMethod.UNIVERSAL_AUTH}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Auth Method" errorText={error?.message} isError={Boolean(error)}>
            <Select
              isDisabled={isSelectedAuthAlreadyConfigured}
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => {
                if (!isAlreadyConfigured(e as IdentityAuthMethod)) {
                  setSelectedAuthMethod(e as IdentityAuthMethod);
                  onChange(e);
                }
              }}
              className="w-full"
            >
              {identityAuthMethods.map(({ label, value }) => {
                const alreadyConfigured = isAlreadyConfigured(value);
                return (
                  <Tooltip
                    key={`auth-method-${value}`}
                    content="Authentication method already configured"
                    isDisabled={!alreadyConfigured}
                  >
                    <SelectItem
                      isDisabled={alreadyConfigured}
                      value={String(value || "")}
                      key={label}
                    >
                      {label}{" "}
                      {alreadyConfigured && !isSelectedAuthAlreadyConfigured && (
                        <Badge>Configured</Badge>
                      )}
                    </SelectItem>
                  </Tooltip>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {selectedMethodItem?.render ? selectedMethodItem.render() : <div />}
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
        onDeleteApproved={async () => {
          if (!identityAuthMethodData.authMethod || !orgId || !selectedMethodItem) {
            return;
          }

          try {
            await selectedMethodItem.revokeMethod({
              identityId: identityAuthMethodData.identityId,
              organizationId: orgId
            });

            createNotification({
              text: "Successfully removed auth method",
              type: "success"
            });

            handlePopUpToggle("revokeAuthMethod", false);
            handlePopUpToggle("identityAuthMethod", false);
          } catch (err) {
            createNotification({
              text: "Failed to remove auth method",
              type: "error"
            });
          }
        }}
      />
    </>
  );
};
