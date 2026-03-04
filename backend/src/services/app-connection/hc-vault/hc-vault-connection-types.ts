import z from "zod";

import { TGatewayV2ConnectionDetails } from "@app/ee/services/gateway-v2/gateway-v2-types";
import { GatewayVersion, TGatewayV1RelayDetails } from "@app/lib/gateway/types";
import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHCVaultConnectionSchema,
  HCVaultConnectionSchema,
  ValidateHCVaultConnectionCredentialsSchema
} from "./hc-vault-connection-schemas";

export type THCVaultConnection = z.infer<typeof HCVaultConnectionSchema>;

export type THCVaultConnectionInput = z.infer<typeof CreateHCVaultConnectionSchema> & {
  app: AppConnection.HCVault;
};

export type TValidateHCVaultConnectionCredentialsSchema = typeof ValidateHCVaultConnectionCredentialsSchema;

export type TValidateHCVaultConnectionCredentials = z.infer<typeof ValidateHCVaultConnectionCredentialsSchema>;

export type THCVaultConnectionConfig = DiscriminativePick<THCVaultConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type THCVaultMountResponse = {
  data: {
    [key: string]: {
      options: {
        version?: string | null;
      } | null;
      type: string; // We're only interested in "kv" types
    };
  };
};

export type THCVaultMount = {
  path: string;
  type: string;
  version?: string | null;
};

export type THCVaultAuthMountResponse = {
  data: {
    [key: string]: {
      type: string;
      description: string;
      accessor: string;
      config: {
        default_lease_ttl: number;
        max_lease_ttl: number;
        force_no_cache: boolean;
      };
      local: boolean;
      seal_wrap: boolean;
      external_entropy_access: boolean;
      options: Record<string, string> | null;
    };
  };
};

export type THCVaultAuthMount = {
  path: string;
  type: string;
  description: string;
  accessor: string;
};

export type THCVaultKubernetesAuthConfig = {
  kubernetes_host: string;
  kubernetes_ca_cert?: string;
  issuer?: string;
  disable_iss_validation?: boolean;
  disable_local_ca_jwt?: boolean;
};

export type THCVaultKubernetesAuthRole = {
  name: string;
  bound_service_account_names: string[];
  bound_service_account_namespaces: string[];
  token_ttl?: number;
  token_max_ttl?: number;
  token_policies?: string[];
  token_bound_cidrs?: string[];
  token_explicit_max_ttl?: number;
  token_no_default_policy?: boolean;
  token_num_uses?: number;
  token_period?: number;
  token_type?: string;
  audience?: string;
  alias_name_source?: string;
};

export type THCVaultKubernetesAuthRoleWithConfig = THCVaultKubernetesAuthRole & {
  config: THCVaultKubernetesAuthConfig;
  mountPath: string;
};

export type THCVaultKubernetesSecretsConfig = {
  kubernetes_host: string;
  kubernetes_ca_cert?: string;
};

export type THCVaultKubernetesRole = {
  name: string;
  allowed_kubernetes_namespaces?: string[];
  allowed_kubernetes_namespace_selector?: string;
  token_max_ttl?: number;
  token_default_ttl?: number;
  token_default_audiences?: string[];
  service_account_name?: string;
  kubernetes_role_name?: string;
  kubernetes_role_type?: string;
  generated_role_rules?: string;
  name_template?: string;
  extra_annotations?: Record<string, string>;
  extra_labels?: Record<string, string>;
  config: THCVaultKubernetesSecretsConfig;
  mountPath: string;
};

export type THCVaultDatabaseConfig = {
  connection_details: {
    connection_url?: string;
    hosts?: string;
    tls_ca?: string;
    username?: string;
  };
  plugin_name: string;
};

export type THCVaultDatabaseRole = {
  name: string;
  db_name: string;
  default_ttl?: number;
  max_ttl?: number;
  creation_statements?: string[];
  revocation_statements?: string[];
  renew_statements?: string[];
  config: THCVaultDatabaseConfig;
  mountPath: string;
};

export type THCVaultLdapConfig = {
  binddn: string;
  url: string;
  certificate?: string;
};

export type THCVaultLdapRole = {
  name: string;
  default_ttl?: number;
  max_ttl?: number;
  creation_ldif?: string;
  deletion_ldif?: string;
  rollback_ldif?: string;
  username_template?: string;
  config: THCVaultLdapConfig;
  mountPath: string;
};

export type TGatewayDetails =
  | {
      gatewayVersion: GatewayVersion.V1;
      details: TGatewayV1RelayDetails;
      target: {
        host: string;
        port: number;
      };
    }
  | {
      gatewayVersion: GatewayVersion.V2;
      details: TGatewayV2ConnectionDetails;
      target: {
        host: string;
        port: number;
      };
    };
