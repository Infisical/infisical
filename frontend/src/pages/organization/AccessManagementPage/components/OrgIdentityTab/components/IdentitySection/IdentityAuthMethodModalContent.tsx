import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Badge, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAliCloudAuthForm } from "./IdentityAliCloudAuthForm";
import { IdentityAwsAuthForm } from "./IdentityAwsAuthForm";
import { IdentityAzureAuthForm } from "./IdentityAzureAuthForm";
import { IdentityGcpAuthForm } from "./IdentityGcpAuthForm";
import { IdentityJwtAuthForm } from "./IdentityJwtAuthForm";
import { IdentityKubernetesAuthForm } from "./IdentityKubernetesAuthForm";
import { IdentityLdapAuthForm } from "./IdentityLdapAuthForm";
import { IdentityOciAuthForm } from "./IdentityOciAuthForm";
import { IdentityOidcAuthForm } from "./IdentityOidcAuthForm";
import { IdentityTlsCertAuthForm } from "./IdentityTlsCertAuthForm";
import { IdentityTokenAuthForm } from "./IdentityTokenAuthForm";
import { IdentityUniversalAuthForm } from "./IdentityUniversalAuthForm";

type Props = {
  popUp: UsePopUpState<["identityAuthMethod", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan"]>,
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

type TRevokeMethods = {
  render: () => JSX.Element;
};

const identityAuthMethods = [
  { label: "Token Auth", value: IdentityAuthMethod.TOKEN_AUTH },
  { label: "Universal Auth", value: IdentityAuthMethod.UNIVERSAL_AUTH },
  { label: "Kubernetes Auth", value: IdentityAuthMethod.KUBERNETES_AUTH },
  { label: "GCP Auth", value: IdentityAuthMethod.GCP_AUTH },
  { label: "Alibaba Cloud Auth", value: IdentityAuthMethod.ALICLOUD_AUTH },
  { label: "AWS Auth", value: IdentityAuthMethod.AWS_AUTH },
  { label: "Azure Auth", value: IdentityAuthMethod.AZURE_AUTH },
  { label: "OCI Auth", value: IdentityAuthMethod.OCI_AUTH },
  { label: "OIDC Auth", value: IdentityAuthMethod.OIDC_AUTH },
  { label: "LDAP Auth", value: IdentityAuthMethod.LDAP_AUTH },
  { label: "TLS Certificate Auth", value: IdentityAuthMethod.TLS_CERT_AUTH },
  {
    label: "JWT Auth",
    value: IdentityAuthMethod.JWT_AUTH
  }
];

const schema = z
  .object({
    authMethod: z.nativeEnum(IdentityAuthMethod)
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const IdentityAuthMethodModalContent = ({
  popUp,
  handlePopUpOpen,
  handlePopUpToggle,
  identity,
  initialAuthMethod,
  setSelectedAuthMethod
}: Props) => {
  const { control, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
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
      render: () => (
        <IdentityUniversalAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },
    [IdentityAuthMethod.TLS_CERT_AUTH]: {
      render: () => (
        <IdentityTlsCertAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.OIDC_AUTH]: {
      render: () => (
        <IdentityOidcAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.TOKEN_AUTH]: {
      render: () => (
        <IdentityTokenAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.AZURE_AUTH]: {
      render: () => (
        <IdentityAzureAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.GCP_AUTH]: {
      render: () => (
        <IdentityGcpAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.KUBERNETES_AUTH]: {
      render: () => (
        <IdentityKubernetesAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.ALICLOUD_AUTH]: {
      render: () => (
        <IdentityAliCloudAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.AWS_AUTH]: {
      render: () => (
        <IdentityAwsAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.OCI_AUTH]: {
      render: () => (
        <IdentityOciAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.JWT_AUTH]: {
      render: () => (
        <IdentityJwtAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      )
    },

    [IdentityAuthMethod.LDAP_AUTH]: {
      render: () => (
        <IdentityLdapAuthForm
          identityId={identityAuthMethodData.identityId}
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
    </>
  );
};
