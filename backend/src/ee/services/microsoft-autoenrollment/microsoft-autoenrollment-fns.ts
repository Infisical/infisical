import dns from "node:dns/promises";
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { parseKeytab } from "@app/lib/kerberos";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import { TLdapConnectionConfig } from "@app/services/app-connection/ldap/ldap-connection-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { TMicrosoftAutoenrollmentAllowedGroup } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";

import {
  getKeyAlgorithmDisplayName,
  isTemplateKeyAlgorithmSupported,
  resolveTemplatePrivateKey,
  TEMPLATE_DEFAULT_KEY_ALGORITHM
} from "./microsoft-autoenrollment-template-fns";

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

export const isComputerInAllowedGroups = (
  allowedGroups: TMicrosoftAutoenrollmentAllowedGroup[],
  computerSids: string[]
) => !allowedGroups.length || allowedGroups.some(({ sid }) => computerSids.includes(sid));

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

export const mergeAllowedGroups = (
  allowedGroupSids: string[],
  resolvedNames: Record<string, string | null> | null,
  storedGroups: TMicrosoftAutoenrollmentAllowedGroup[]
): TMicrosoftAutoenrollmentAllowedGroup[] =>
  allowedGroupSids.map((sid) => ({
    sid,
    name: resolvedNames?.[sid] ?? storedGroups.find((group) => group.sid === sid)?.name ?? null
  }));

type TProfileCaCompatibilityInput = {
  profileSlug: string;
  caId?: string | null;
  keyAlgorithm?: CertKeyAlgorithm;
};

const checkProfileCaCompatibility = async (
  { profileSlug, caId, keyAlgorithm }: TProfileCaCompatibilityInput,
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

  if (keyAlgorithm && !isTemplateKeyAlgorithmSupported(keyAlgorithm)) {
    return {
      shortReason: `Windows autoenrollment supports only RSA and ECDSA keys, not the profile's ${keyAlgorithm} default`,
      message: `Profile '${profileSlug}' has ${keyAlgorithm} as its default key algorithm, but Windows autoenrollment supports only RSA and ECDSA keys. Change the profile's default key algorithm to RSA or ECDSA.`
    };
  }
  if (isInternalCa && isCompatibleCaKey) return null;
  if (!isInternalCa) {
    return {
      shortReason: "Windows needs a profile that issues from an internal certificate authority",
      message: `Microsoft Autoenrollment requires a profile that issues from an internal certificate authority, because Windows needs the issuing CA certificate in the template list. Profile '${profileSlug}' does not.`
    };
  }
  const caKeyName = getKeyAlgorithmDisplayName(caKeyAlgorithm);
  if (!keyAlgorithm) {
    const defaultKeyName = getKeyAlgorithmDisplayName(TEMPLATE_DEFAULT_KEY_ALGORITHM);
    return {
      shortReason: `the profile has no default key algorithm, so Windows would request ${defaultKeyName} keys, which its certificate authority's ${caKeyName} key cannot sign`,
      message: `Profile '${profileSlug}' has no default key algorithm, so Windows requests ${defaultKeyName} keys, but its certificate authority's ${caKeyName} key cannot sign that request. Use a certificate authority with an RSA key, or set the profile's default key algorithm.`
    };
  }
  const keyName = getKeyAlgorithmDisplayName(keyAlgorithm);
  return {
    shortReason: `the profile would ask Windows for ${keyName} keys, which its certificate authority's ${caKeyName} key cannot sign`,
    message: `Profile '${profileSlug}' asks Windows for ${keyName} keys, but its certificate authority's ${caKeyName} key cannot sign that request. Use a certificate authority with ${keyFamily} key, or change the profile's default key algorithm.`
  };
};

export const getMicrosoftAutoenrollmentUnsupportedReason = async (
  input: TProfileCaCompatibilityInput,
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">
) => (await checkProfileCaCompatibility(input, certificateAuthorityDAL))?.message ?? null;

export const assertProfileCaSupportsMicrosoftAutoenrollment = async (
  {
    enabledInApplicationNames,
    ...input
  }: TProfileCaCompatibilityInput & {
    enabledInApplicationNames?: string[];
  },
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">
) => {
  const incompatibility = await checkProfileCaCompatibility(input, certificateAuthorityDAL);
  if (!incompatibility) return;

  if (enabledInApplicationNames?.length) {
    const quotedNames = enabledInApplicationNames.map((name) => `'${name}'`);
    const applicationList =
      quotedNames.length === 1
        ? `application ${quotedNames[0]}`
        : `applications ${quotedNames.slice(0, -1).join(", ")} and ${quotedNames[quotedNames.length - 1]}`;
    throw new BadRequestError({
      message: `Microsoft Autoenrollment is on for profile '${input.profileSlug}' in ${applicationList}. This change would stop it working: ${incompatibility.shortReason}. Turn Microsoft Autoenrollment off there first, or keep the profile's certificate authority and default key algorithm compatible.`
    });
  }

  throw new BadRequestError({ message: incompatibility.message });
};
