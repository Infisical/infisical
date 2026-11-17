import dns from "node:dns/promises";
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { parseKeytab } from "@app/lib/kerberos";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import { TLdapConnectionConfig } from "@app/services/app-connection/ldap/ldap-connection-types";
import {
  resolveDirectorySidNames,
  TLdapDirectoryGatewayServices
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { resolveTemplatePrivateKey } from "./microsoft-autoenrollment-template-fns";

const MAX_CNAME_HOPS = 10;
const CNAME_END_OF_CHAIN_CODES = ["ENODATA", "ENOTFOUND"];
const HTTP_SERVICE_PRINCIPAL_PREFIX = "HTTP/";
const HTTP_SERVICE_PRINCIPAL_PATTERN = new RE2("^http/[a-z0-9.-]{1,253}$");

export const buildPolicyUrl = (applicationId: string, profileId: string) =>
  `${getConfig().SITE_URL ?? ""}/cep/applications/${applicationId}/profiles/${profileId}`;

export const buildCesUrl = (applicationId: string, profileId: string) =>
  `${getConfig().SITE_URL ?? ""}/ces/applications/${applicationId}/profiles/${profileId}`;

export const stripKerberosRealm = (principalName: string) => principalName.split("@")[0];

export const normalizeHttpServicePrincipalName = (serviceName: string | undefined) => {
  const lowerCaseName = serviceName?.toLowerCase();
  if (!lowerCaseName || !HTTP_SERVICE_PRINCIPAL_PATTERN.test(lowerCaseName)) return null;
  return `${HTTP_SERVICE_PRINCIPAL_PREFIX}${lowerCaseName.slice(HTTP_SERVICE_PRINCIPAL_PREFIX.length)}`;
};

export const isComputerInAllowedGroups = (allowedGroupSids: string[] | null | undefined, computerSids: string[]) =>
  !allowedGroupSids?.length || allowedGroupSids.some((sid) => computerSids.includes(sid));

const resolveCnameTarget = async (hostname: string) => {
  const [target] = await dns.resolveCname(hostname).catch((error: NodeJS.ErrnoException): string[] => {
    if (error.code && CNAME_END_OF_CHAIN_CODES.includes(error.code)) return [];
    throw new BadRequestError({
      message: `Could not resolve the hostname '${hostname}' in DNS (${error.code ?? "unknown error"}). Check the DNS records for the instance URL (SITE_URL) and try again.`
    });
  });
  return target;
};

export const resolveCanonicalHostname = async (hostname: string) => {
  let current = hostname.toLowerCase();
  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    // eslint-disable-next-line no-await-in-loop
    const target = await resolveCnameTarget(current);
    if (!target) return current;
    current = target.toLowerCase();
  }
  return current;
};

export const resolveInstanceServicePrincipalName = async () => {
  const siteUrl = getConfig().SITE_URL;
  if (!siteUrl) {
    throw new BadRequestError({
      message:
        "The instance URL (SITE_URL) is not set, so the Kerberos service principal cannot be worked out. Set SITE_URL and try again."
    });
  }
  const hostname = await resolveCanonicalHostname(new URL(siteUrl).hostname);
  return `${HTTP_SERVICE_PRINCIPAL_PREFIX}${hostname}`;
};

export const loadLdapConnectionConfig = async (
  appConnectionId: string,
  {
    appConnectionDAL,
    kmsService
  }: {
    appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
    kmsService: TAppConnectionServiceFactoryDep["kmsService"];
  }
) => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  return (await decryptAppConnection(appConnection, kmsService)) as unknown as TLdapConnectionConfig;
};

export const readUploadedKeytab = (keytabFile: Buffer) => {
  const keytabEntries = parseKeytab(keytabFile);
  const principals = [
    ...new Map(
      keytabEntries.map((entry) => {
        const principal = `${entry.principal}@${entry.realm}`;
        return [principal.toLowerCase(), principal];
      })
    ).values()
  ];
  if (principals.length > 1) {
    throw new BadRequestError({
      message: `The keytab holds keys for more than one service principal (${principals.join(", ")}). Create a keytab for one service principal only.`
    });
  }
  const newestEntry = keytabEntries.reduce((newest, entry) => (entry.keyVersion > newest.keyVersion ? entry : newest));
  return { servicePrincipalName: `${newestEntry.principal}@${newestEntry.realm}`, keyVersion: newestEntry.keyVersion };
};

export const mergeAllowedGroupNames = (
  allowedGroupSids: string[],
  resolvedNames: Record<string, string | null> | null,
  storedNames: Record<string, string | null>
): Record<string, string | null> =>
  Object.fromEntries(allowedGroupSids.map((sid) => [sid, resolvedNames?.[sid] ?? storedNames[sid] ?? null]));

export const resolveAllowedGroupNames = async (
  {
    allowedGroupSids,
    appConnectionId,
    storedNames
  }: { allowedGroupSids: string[]; appConnectionId: string; storedNames: Record<string, string | null> },
  {
    appConnectionDAL,
    kmsService,
    ...gatewayServices
  }: {
    appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
    kmsService: TAppConnectionServiceFactoryDep["kmsService"];
  } & TLdapDirectoryGatewayServices
): Promise<Record<string, string | null>> => {
  const resolvedNames = allowedGroupSids.length
    ? await loadLdapConnectionConfig(appConnectionId, { appConnectionDAL, kmsService })
        .then((config) => resolveDirectorySidNames({ config, sids: allowedGroupSids }, gatewayServices))
        .catch((err: unknown) => {
          logger.warn(
            { err },
            `Unable to resolve Microsoft Autoenrollment group names from Active Directory [connectionId=${appConnectionId}]`
          );
          return null;
        })
    : null;
  return mergeAllowedGroupNames(allowedGroupSids, resolvedNames, storedNames);
};

export const assertProfileCaSupportsMicrosoftAutoenrollment = async (
  {
    profileSlug,
    caId,
    keyAlgorithm,
    enabledInApplicationNames
  }: {
    profileSlug: string;
    caId?: string | null;
    keyAlgorithm?: CertKeyAlgorithm;
    enabledInApplicationNames?: string[];
  },
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">
) => {
  const ca = caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(caId) : null;
  const caKeyAlgorithm = ca?.internalCa?.keyAlgorithm ?? "";
  const isEllipticCurveProfile = Boolean(resolveTemplatePrivateKey(keyAlgorithm).ellipticCurve);
  const keyFamily = isEllipticCurveProfile ? "an elliptic curve" : "an RSA";
  const isInternalCa = Boolean(ca && !ca.externalCa?.type);
  const isCompatibleCaKey = isEllipticCurveProfile
    ? caKeyAlgorithm.startsWith("EC_")
    : caKeyAlgorithm.startsWith("RSA_");
  if (isInternalCa && isCompatibleCaKey) return;

  if (enabledInApplicationNames?.length) {
    const quotedNames = enabledInApplicationNames.map((name) => `'${name}'`);
    const applicationList =
      quotedNames.length === 1
        ? `application ${quotedNames[0]}`
        : `applications ${quotedNames.slice(0, -1).join(", ")} and ${quotedNames[quotedNames.length - 1]}`;
    const reason = isInternalCa
      ? `the profile would ask Windows for ${keyFamily} key, which its certificate authority's ${caKeyAlgorithm} key cannot sign`
      : "Windows needs a profile that issues from an internal certificate authority";
    throw new BadRequestError({
      message: `Microsoft Autoenrollment is on for profile '${profileSlug}' in ${applicationList}. This change would stop it working: ${reason}. Turn Microsoft Autoenrollment off there first, or keep the profile's certificate authority and default key algorithm compatible.`
    });
  }

  if (!isInternalCa) {
    throw new BadRequestError({
      message: `Microsoft Autoenrollment requires a profile that issues from an internal certificate authority, because Windows needs the issuing CA certificate in the template list. Profile '${profileSlug}' does not.`
    });
  }
  throw new BadRequestError({
    message: `Profile '${profileSlug}' asks Windows for ${keyFamily} key, but its certificate authority's key is ${caKeyAlgorithm}, which cannot sign that request. Use a certificate authority with ${keyFamily} key, or change the profile's default key algorithm.`
  });
};
