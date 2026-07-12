import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Badge,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK } from "@app/helpers/identityAuthSchemas";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
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
import { IdentitySpiffeAuthForm } from "./IdentitySpiffeAuthForm";
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
  isUpdate: boolean;
  onSubmittingChange: (isSubmitting: boolean) => void;
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
  },
  { label: "SPIFFE Auth", value: IdentityAuthMethod.SPIFFE_AUTH }
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
  setSelectedAuthMethod,
  isUpdate,
  onSubmittingChange
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

  const { data: serverStatus } = useFetchServerStatus();
  const maxAccessTokenTTL =
    serverStatus?.maxIdentityAccessTokenTTL ?? MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK;

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
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },
    [IdentityAuthMethod.TLS_CERT_AUTH]: {
      render: () => (
        <IdentityTlsCertAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.OIDC_AUTH]: {
      render: () => (
        <IdentityOidcAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.TOKEN_AUTH]: {
      render: () => (
        <IdentityTokenAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.AZURE_AUTH]: {
      render: () => (
        <IdentityAzureAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.GCP_AUTH]: {
      render: () => (
        <IdentityGcpAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.KUBERNETES_AUTH]: {
      render: () => (
        <IdentityKubernetesAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.ALICLOUD_AUTH]: {
      render: () => (
        <IdentityAliCloudAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.AWS_AUTH]: {
      render: () => (
        <IdentityAwsAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.OCI_AUTH]: {
      render: () => (
        <IdentityOciAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.JWT_AUTH]: {
      render: () => (
        <IdentityJwtAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.LDAP_AUTH]: {
      render: () => (
        <IdentityLdapAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
        />
      )
    },

    [IdentityAuthMethod.SPIFFE_AUTH]: {
      render: () => (
        <IdentitySpiffeAuthForm
          identityId={identityAuthMethodData.identityId}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          maxAccessTokenTTL={maxAccessTokenTTL}
          isUpdate={isUpdate}
          onSubmittingChange={onSubmittingChange}
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
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field className="mb-2">
            <FieldLabel htmlFor="auth-method">Auth Method</FieldLabel>
            <Select
              value={value}
              disabled={isSelectedAuthAlreadyConfigured}
              onValueChange={(next) => {
                if (!isAlreadyConfigured(next as IdentityAuthMethod)) {
                  setSelectedAuthMethod(next as IdentityAuthMethod);
                  onChange(next);
                }
              }}
            >
              <SelectTrigger id="auth-method" className="w-full" isError={Boolean(error)}>
                <SelectValue placeholder="Select auth method" />
              </SelectTrigger>
              <SelectContent position="popper">
                {identityAuthMethods.map(({ label, value: methodValue }) => {
                  const alreadyConfigured = isAlreadyConfigured(methodValue);
                  const item = (
                    <SelectItem
                      key={label}
                      disabled={alreadyConfigured}
                      value={String(methodValue || "")}
                    >
                      <span className="flex items-center gap-2">
                        {label}
                        {alreadyConfigured && !isSelectedAuthAlreadyConfigured && (
                          <Badge variant="info">Configured</Badge>
                        )}
                      </span>
                    </SelectItem>
                  );
                  return alreadyConfigured ? (
                    <Tooltip key={`auth-method-${methodValue}`}>
                      <TooltipTrigger asChild>{item}</TooltipTrigger>
                      <TooltipContent side="right">
                        Authentication method already configured
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    item
                  );
                })}
              </SelectContent>
            </Select>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {selectedMethodItem?.render ? selectedMethodItem.render() : <div />}
      <UpgradePlanModal
        isOpen={popUp?.upgradePlan?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={`Your current plan does not include access to ${popUp.upgradePlan.data?.featureName}. To unlock this feature, please upgrade to Infisical ${popUp.upgradePlan.data?.isEnterpriseFeature ? "Enterprise" : "Pro"} plan.`}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
