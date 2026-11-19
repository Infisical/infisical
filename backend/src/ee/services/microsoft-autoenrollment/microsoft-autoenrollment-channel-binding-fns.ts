import net from "node:net";

import * as x509 from "@peculiar/x509";
import dns from "node:dns/promises";
import { z } from "zod";

import { scanEndpoint } from "@app/ee/services/pki-discovery/pki-discovery-fns";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { asNonSharedBuffer } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { MicrosoftAutoenrollmentChannelBindingStatus } from "./microsoft-autoenrollment-types";

const TLS_SERVER_END_POINT_PREFIX = "tls-server-end-point:";
const GSS_CHANNEL_BINDINGS_HEADER_LENGTH = 20;
const GSS_APPLICATION_DATA_LENGTH_OFFSET = 16;
const DEFAULT_TLS_SERVER_END_POINT_HASH = "sha256";
const TLS_SERVER_END_POINT_HASHES: Record<string, string> = {
  "SHA-384": "sha384",
  "SHA-512": "sha512"
};
const RSA_SIGNATURE_ALGORITHMS = [
  "RSA-PSS+SHA256",
  "RSA-PSS+SHA384",
  "RSA-PSS+SHA512",
  "RSA+SHA256",
  "RSA+SHA384",
  "RSA+SHA512"
].join(":");
const DEFAULT_HTTPS_PORT = 443;
const TLS_SCAN_TIMEOUT_MS = 3000;
const SYSTEM_LOOKUP_TIMEOUT_MS = 5000;
const MAX_SCANNED_ADDRESSES = 16;

const CHANNEL_BINDING_RETENTION_MS = KeyStoreTtls.MicrosoftAutoenrollmentServerChannelBindingsInSeconds * 1000;

export type TInstanceTlsEndpoint = { host: string; port: number };

export const ServerChannelBindingsCacheSchema = z.array(
  z.object({ binding: z.string().length(32), seenAt: z.string().datetime() })
);

export type TServerChannelBindingEntry = z.infer<typeof ServerChannelBindingsCacheSchema>[number];

export const describeEndpoint = ({ host, port }: TInstanceTlsEndpoint) => `${host}:${port}`;

const readSignatureHashName = (certificateDer: Buffer) => {
  const { hash } = new x509.X509Certificate(asNonSharedBuffer(certificateDer)).signatureAlgorithm as {
    hash?: string | { name?: string };
  };
  return typeof hash === "string" ? hash : hash?.name;
};

export const computeTlsServerEndPointHash = (certificateDer: Buffer) => {
  const hashName = TLS_SERVER_END_POINT_HASHES[readSignatureHashName(certificateDer)?.toUpperCase() ?? ""];
  return crypto.nativeCrypto
    .createHash(hashName ?? DEFAULT_TLS_SERVER_END_POINT_HASH)
    .update(certificateDer)
    .digest();
};

export const computeGssChannelBindingHash = (applicationData: Buffer) => {
  const header = Buffer.alloc(GSS_CHANNEL_BINDINGS_HEADER_LENGTH);
  header.writeUInt32LE(applicationData.length, GSS_APPLICATION_DATA_LENGTH_OFFSET);
  return crypto.nativeCrypto
    .createHash("md5")
    .update(Buffer.concat([header, applicationData]))
    .digest();
};

export const computeCertificateChannelBinding = (certificateDer: Buffer) =>
  computeGssChannelBindingHash(
    Buffer.concat([Buffer.from(TLS_SERVER_END_POINT_PREFIX, "ascii"), computeTlsServerEndPointHash(certificateDer)])
  );

export const getInstanceTlsEndpoint = (): TInstanceTlsEndpoint | null => {
  const siteUrl = getConfig().SITE_URL;
  if (!siteUrl || !URL.canParse(siteUrl)) return null;
  const url = new URL(siteUrl);
  if (url.protocol !== "https:") return null;
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return { host: host.toLowerCase(), port: url.port ? Number(url.port) : DEFAULT_HTTPS_PORT };
};

const lookUpSystemAddresses = (host: string) =>
  new Promise<string[]>((resolve) => {
    const timer = setTimeout(() => resolve([]), SYSTEM_LOOKUP_TIMEOUT_MS);
    dns
      .lookup(host, { all: true })
      .then(
        (addresses) => resolve(addresses.map(({ address }) => address)),
        () => resolve([])
      )
      .finally(() => clearTimeout(timer));
  });

const resolveInstanceAddresses = async (host: string) => {
  if (net.isIP(host)) return [host];
  const addresses = [...new Set(await lookUpSystemAddresses(host))];
  if (addresses.length > MAX_SCANNED_ADDRESSES) {
    logger.warn(
      { host, addressCount: addresses.length },
      `The instance host resolves to more than ${MAX_SCANNED_ADDRESSES} addresses; reading TLS certificates from the first ${MAX_SCANNED_ADDRESSES} only`
    );
  }
  return addresses.slice(0, MAX_SCANNED_ADDRESSES);
};

export const learnServerChannelBindings = async ({ host, port }: TInstanceTlsEndpoint) => {
  const addresses = await resolveInstanceAddresses(host);
  const scans = await Promise.all(
    addresses.flatMap((address) =>
      [undefined, RSA_SIGNATURE_ALGORITHMS].map((sigalgs) =>
        scanEndpoint(address, port, TLS_SCAN_TIMEOUT_MS, host, sigalgs)
      )
    )
  );

  const channelBindings = new Set<string>();
  for (const scan of scans) {
    const leafCertificatePem = scan.certificates?.[0]?.pemChain[0];
    if (leafCertificatePem) {
      try {
        const leafCertificate = new crypto.nativeCrypto.X509Certificate(leafCertificatePem);
        const isIssuedForHost = net.isIP(host) ? leafCertificate.checkIP(host) : leafCertificate.checkHost(host);
        if (isIssuedForHost) {
          channelBindings.add(computeCertificateChannelBinding(leafCertificate.raw).toString("hex"));
        }
      } catch (err) {
        logger.warn({ err, host, address: scan.host }, "Unable to read the TLS certificate the instance host serves");
      }
    }
  }
  return [...channelBindings];
};

const parseServerChannelBindings = (cached: string | null) => {
  if (!cached) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cached);
  } catch {
    return [];
  }
  const entries = ServerChannelBindingsCacheSchema.safeParse(parsed);
  if (!entries.success) return [];
  const retainedAfter = Date.now() - CHANNEL_BINDING_RETENTION_MS;
  return entries.data.filter(({ seenAt }) => new Date(seenAt).getTime() >= retainedAfter);
};

export const readServerChannelBindings = async (
  keyStore: Pick<TKeyStoreFactory, "getItem">,
  endpoint: TInstanceTlsEndpoint
) =>
  parseServerChannelBindings(
    await keyStore
      .getItem(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(describeEndpoint(endpoint)))
      .catch((err: unknown) => {
        logger.warn({ err }, "Unable to read the cached TLS channel bindings for Microsoft Autoenrollment");
        return null;
      })
  );

export const hasServerChannelBindingLearningFailed = async (
  keyStore: Pick<TKeyStoreFactory, "getItem">,
  endpoint: TInstanceTlsEndpoint
) =>
  Boolean(
    await keyStore
      .getItem(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLearnFailed(describeEndpoint(endpoint)))
      .catch(() => null)
  );

export const describeUnverifiableChannelBinding = (endpoint: TInstanceTlsEndpoint | null) => {
  if (crypto.isFipsModeEnabled()) {
    return "FIPS mode blocks the MD5 hash Windows uses for channel bindings.";
  }
  if (!endpoint) {
    return "SITE_URL isn't an https URL.";
  }
  return `This instance can't read the TLS certificate it serves at ${describeEndpoint(endpoint)}.`;
};

const CHANNEL_BINDING_NOT_CHECKED_REASON = "This instance checks its TLS certificate at the first enrollment request.";

export const readChannelBindingStatus = async (keyStore: Pick<TKeyStoreFactory, "getItem">) => {
  const endpoint = crypto.isFipsModeEnabled() ? null : getInstanceTlsEndpoint();
  if (!endpoint) {
    return {
      status: MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable,
      reason: describeUnverifiableChannelBinding(endpoint)
    };
  }
  const endpointKey = describeEndpoint(endpoint);
  try {
    const [cached, lastFailure] = await Promise.all([
      keyStore.getItem(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(endpointKey)),
      keyStore.getItem(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(endpointKey))
    ]);
    if (parseServerChannelBindings(cached).length) {
      return { status: MicrosoftAutoenrollmentChannelBindingStatus.Enforced, reason: null };
    }
    if (lastFailure) {
      return { status: MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable, reason: lastFailure };
    }
  } catch (err) {
    logger.warn({ err }, "Unable to read the TLS channel binding status for Microsoft Autoenrollment");
  }
  return {
    status: MicrosoftAutoenrollmentChannelBindingStatus.NotChecked,
    reason: CHANNEL_BINDING_NOT_CHECKED_REASON
  };
};
