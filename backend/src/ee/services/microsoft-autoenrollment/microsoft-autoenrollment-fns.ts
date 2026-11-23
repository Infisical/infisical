import { Knex } from "knex";

import { getConfig } from "@app/lib/config/env";
import { followCnameChain } from "@app/lib/dns";
import { BadRequestError } from "@app/lib/errors";
import { parseKeytab } from "@app/lib/kerberos";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactoryDep } from "@app/services/app-connection/app-connection-service";
import { TLdapConnectionConfig } from "@app/services/app-connection/ldap/ldap-connection-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { isSignatureAlgorithmCompatibleWithCaKey } from "@app/services/certificate-common/certificate-issuance-utils";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { TMicrosoftAutoenrollmentAllowedGroup } from "@app/services/enrollment-config/microsoft-autoenrollment-enrollment-config-dal";

import {
  getKeyAlgorithmDisplayName,
  isTemplateKeyAlgorithmSupported,
  resolveTemplatePrivateKey,
  resolveTemplateSignatureAlgorithm,
  TEMPLATE_DEFAULT_KEY_ALGORITHM
} from "./microsoft-autoenrollment-template-fns";

const CNAME_END_OF_CHAIN_CODES = ["ENODATA", "ENOTFOUND"];
const HTTP_SERVICE_PRINCIPAL_PREFIX = "HTTP/";

export const buildPolicyUrl = (applicationId: string, profileId: string) =>
  `${getConfig().SITE_URL ?? ""}/cep/applications/${applicationId}/profiles/${profileId}`;

export const buildCesUrl = (applicationId: string, profileId: string) =>
  `${getConfig().SITE_URL ?? ""}/ces/applications/${applicationId}/profiles/${profileId}`;

export const stripKerberosRealm = (principalName: string) => principalName.split("@")[0];

export const isComputerInAllowedGroups = (
  allowedGroups: TMicrosoftAutoenrollmentAllowedGroup[],
  computerSids: string[]
) => !allowedGroups.length || allowedGroups.some(({ sid }) => computerSids.includes(sid));

export const resolveCanonicalHostname = async (hostname: string) =>
  (
    await followCnameChain(hostname.toLowerCase(), (error, lookedUpHostname) => {
      if (error.code && CNAME_END_OF_CHAIN_CODES.includes(error.code)) return;
      throw new BadRequestError({
        message: `Could not resolve the hostname '${lookedUpHostname}' in DNS (${error.code ?? "unknown error"}). Check the DNS records for the instance URL (SITE_URL) and try again.`
      });
    })
  ).toLowerCase();

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
    kmsDataKeyService
  }: {
    appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
    kmsDataKeyService: TAppConnectionServiceFactoryDep["kmsDataKeyService"];
  }
) => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  return (await decryptAppConnection(appConnection, kmsDataKeyService)) as unknown as TLdapConnectionConfig;
};

const MAX_STORED_KEY_VERSION = 2147483647;
export const MAX_KEYTAB_BYTES = 64 * 1024;

export const readUploadedKeytab = (keytabFile: Buffer) => {
  if (keytabFile.length > MAX_KEYTAB_BYTES) {
    throw new BadRequestError({ message: "The keytab file cannot be larger than 64 KB" });
  }
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
  if (newestEntry.keyVersion > MAX_STORED_KEY_VERSION) {
    throw new BadRequestError({
      message: "The uploaded file is not a valid keytab. Upload the keytab file that ktpass created."
    });
  }
  return { servicePrincipalName: `${newestEntry.principal}@${newestEntry.realm}`, keyVersion: newestEntry.keyVersion };
};

export const describeUnreadableUserAccountControl = (samAccountName: string) =>
  `The LDAP connection's account cannot read userAccountControl for computer ${samAccountName}, so it is unknown whether the computer is disabled. Allow that account to read userAccountControl on computer objects.`;

export const mergeAllowedGroups = (
  allowedGroupSids: string[],
  resolvedNames: Record<string, string | null> | null,
  storedGroups: TMicrosoftAutoenrollmentAllowedGroup[]
): TMicrosoftAutoenrollmentAllowedGroup[] =>
  allowedGroupSids.flatMap((sid) => {
    const name = resolvedNames?.[sid] ?? storedGroups.find((group) => group.sid === sid)?.name;
    return name ? [{ sid, name }] : [];
  });

type TProfileCaCompatibilityInput = {
  profileSlug: string;
  caId?: string | null;
  keyAlgorithm?: CertKeyAlgorithm;
};

const checkProfileCaCompatibility = async (
  { profileSlug, caId, keyAlgorithm }: TProfileCaCompatibilityInput,
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">,
  tx?: Knex
) => {
  const ca = caId ? await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx) : null;
  const caKeyAlgorithm = ca?.internalCa?.keyAlgorithm ?? "";
  const isEllipticCurveProfile = Boolean(resolveTemplatePrivateKey(keyAlgorithm).ellipticCurve);
  const keyFamily = isEllipticCurveProfile ? "an elliptic curve" : "an RSA";
  const isInternalCa = Boolean(ca && !ca.externalCa?.type);
  const isCompatibleCaKey = isSignatureAlgorithmCompatibleWithCaKey(
    resolveTemplateSignatureAlgorithm({ keyAlgorithm }).signatureAlgorithm,
    caKeyAlgorithm
  );

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

export const loadTemplateSigningCa = async (
  caId: string | null | undefined,
  {
    certificateAuthorityDAL,
    certificateAuthoritySecretDAL
  }: {
    certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
    certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  },
  tx?: Knex
) => {
  if (!caId) return null;
  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
  const secret = await certificateAuthoritySecretDAL.findOne({ caId }, tx);
  return { keyAlgorithm: ca?.internalCa?.keyAlgorithm, keySource: secret?.keySource };
};

export const describeApplicationList = (applicationNames: string[]) => {
  const quotedNames = applicationNames.map((name) => `'${name}'`);
  return quotedNames.length === 1
    ? `application ${quotedNames[0]}`
    : `applications ${quotedNames.slice(0, -1).join(", ")} and ${quotedNames[quotedNames.length - 1]}`;
};

export const assertProfileCaSupportsMicrosoftAutoenrollment = async (
  {
    enabledInApplicationNames,
    ...input
  }: TProfileCaCompatibilityInput & {
    enabledInApplicationNames?: string[];
  },
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">,
  tx?: Knex
) => {
  const incompatibility = await checkProfileCaCompatibility(input, certificateAuthorityDAL, tx);
  if (!incompatibility) return;

  if (enabledInApplicationNames?.length) {
    throw new BadRequestError({
      message: `Microsoft Autoenrollment is on for profile '${input.profileSlug}' in ${describeApplicationList(enabledInApplicationNames)}. This change would stop it working: ${incompatibility.shortReason}. Turn Microsoft Autoenrollment off there first, or keep the profile's certificate authority and default key algorithm compatible.`
    });
  }

  throw new BadRequestError({ message: incompatibility.message });
};
