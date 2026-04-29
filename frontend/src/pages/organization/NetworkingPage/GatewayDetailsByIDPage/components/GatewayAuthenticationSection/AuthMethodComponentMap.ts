import { GatewayAwsAuthForm } from "./GatewayAwsAuthForm";
import { GatewayTokenAuthForm } from "./GatewayTokenAuthForm";

export type GatewayAuthMethod = "aws" | "token";

export const gatewayAuthMethodToNameMap: Record<GatewayAuthMethod, string> = {
  aws: "AWS Auth",
  token: "Token Auth"
};

export const EditAuthMethodMap: Record<
  GatewayAuthMethod,
  typeof GatewayAwsAuthForm | typeof GatewayTokenAuthForm
> = {
  aws: GatewayAwsAuthForm,
  token: GatewayTokenAuthForm
};

// Methods rendered in the picker, in display order. Only methods we support today.
export const AVAILABLE_GATEWAY_AUTH_METHODS: GatewayAuthMethod[] = ["token", "aws"];
