import net from "node:net";

import * as x509 from "@peculiar/x509";
import dns from "node:dns/promises";

import { resolveDomain, scanEndpoint } from "@app/ee/services/pki-discovery/pki-discovery-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { asNonSharedBuffer } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

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

export type TInstanceTlsEndpoint = { host: string; port: number };

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
  const [publicAddresses, systemAddresses] = await Promise.all([
    resolveDomain(host).catch(() => []),
    lookUpSystemAddresses(host)
  ]);
  const addresses = [...new Set([...systemAddresses, ...publicAddresses])];
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
