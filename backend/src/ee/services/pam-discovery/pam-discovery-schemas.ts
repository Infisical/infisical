import { z } from "zod";

import { PamAccountType } from "../pam/pam-enums";
import { ActiveDirectoryDiscoveryConfigSchema } from "./active-directory/active-directory-discovery-schemas";
import { PamDiscoveryType } from "./pam-discovery-enums";
import { UnixDiscoveryConfigSchema } from "./unix/unix-discovery-schemas";

export const DISCOVERY_TYPE_CONFIGS = {
  [PamDiscoveryType.ActiveDirectory]: {
    name: "Active Directory",
    icon: "ActiveDirectory.png",
    credentialAccountType: PamAccountType.WindowsAd,
    configuration: ActiveDirectoryDiscoveryConfigSchema
  },
  [PamDiscoveryType.Unix]: {
    name: "Linux/Unix",
    icon: "SSH.png",
    credentialAccountType: PamAccountType.SSH,
    configuration: UnixDiscoveryConfigSchema
  }
} as const satisfies Partial<
  Record<
    PamDiscoveryType,
    {
      name: string;
      icon: string;
      credentialAccountType: PamAccountType;
      configuration: z.ZodTypeAny;
    }
  >
>;

type TSupportedDiscoveryType = keyof typeof DISCOVERY_TYPE_CONFIGS;

export const getDiscoveryTypeConfig = (discoveryType: PamDiscoveryType | string) => {
  const config = DISCOVERY_TYPE_CONFIGS[discoveryType as TSupportedDiscoveryType];
  if (!config) throw new Error(`Discovery type '${discoveryType}' is not supported`);
  return config;
};

export const validateDiscoveryConfiguration = (discoveryType: PamDiscoveryType, data: unknown) =>
  getDiscoveryTypeConfig(discoveryType).configuration.parse(data ?? {}) as Record<string, unknown>;

export const getCredentialAccountType = (discoveryType: PamDiscoveryType): PamAccountType =>
  getDiscoveryTypeConfig(discoveryType).credentialAccountType;

export const PamDiscoveryTypeMetadataSchema = z.object({
  type: z.nativeEnum(PamDiscoveryType),
  name: z.string(),
  icon: z.string(),
  credentialAccountType: z.nativeEnum(PamAccountType)
});

export const buildPamDiscoveryTypeMetadata = () =>
  (
    Object.entries(DISCOVERY_TYPE_CONFIGS) as [
      TSupportedDiscoveryType,
      (typeof DISCOVERY_TYPE_CONFIGS)[TSupportedDiscoveryType]
    ][]
  ).map(([type, config]) => ({
    type,
    name: config.name,
    icon: config.icon,
    credentialAccountType: config.credentialAccountType
  }));
