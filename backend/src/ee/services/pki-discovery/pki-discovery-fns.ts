import * as x509 from "@peculiar/x509";
import crypto from "crypto";
import dns from "dns";
import net from "net";
import { Netmask } from "netmask";
import RE2 from "re2";
import tls from "tls";

import { getConfig } from "@app/lib/config/env";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { logger } from "@app/lib/logger";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyUsage,
  CertSignatureAlgorithm
} from "@app/services/certificate/certificate-types";

import {
  PkiInstallationLocationType,
  ScanEndpointFailureReason,
  TPkiDiscoveryTargetConfig,
  TPkiInstallationLocationDetails,
  TScanCertificateResult,
  TScanEndpointResult,
  TScanTarget
} from "./pki-discovery-types";

const PUBLIC_DNS_RESOLVERS = [
  { name: "Google", servers: ["8.8.8.8", "8.8.4.4"] },
  { name: "Cloudflare", servers: ["1.1.1.1", "1.0.0.1"] },
  { name: "Quad9", servers: ["9.9.9.9", "149.112.112.112"] },
  { name: "OpenDNS", servers: ["208.67.222.222", "208.67.220.220"] }
];

const DNS_RESOLUTION_TIMEOUT = 5000;

export const DEFAULT_TLS_PORTS = "443, 8443, 636, 993, 995";
export const MAX_PORTS = 5;
export const MAX_IPS = 256;
export const MAX_DOMAINS = 5;
export const MIN_CIDR_PREFIX = 24;

const TLS_SCAN_TIMEOUT = 10000;

const shouldBlockPrivateIps = (hasGateway: boolean): boolean => {
  if (hasGateway) return false;
  const appCfg = getConfig();
  if (appCfg.isDevelopmentMode || appCfg.ALLOW_INTERNAL_IP_CONNECTIONS) return false;
  return true;
};

export type TTargetValidationResult = {
  valid: boolean;
  error?: string;
  ipCount?: number;
  portCount?: number;
};

export const validateTargetConfig = (
  ipRanges: string[] | undefined,
  ports: string | undefined,
  domains?: string[],
  hasGateway?: boolean
): TTargetValidationResult => {
  if (!ports || !ports.trim()) {
    return { valid: false, error: "Ports are required" };
  }

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const parsedPorts = parsePorts(ports, MAX_PORTS + 1); // Parse one extra to detect overflow
  if (parsedPorts.length === 0) {
    return { valid: false, error: "No valid ports specified" };
  }
  if (parsedPorts.length > MAX_PORTS) {
    return { valid: false, error: `Maximum ${MAX_PORTS} ports allowed` };
  }

  const hasIpRanges = ipRanges && ipRanges.length > 0;
  const hasDomains = domains && domains.length > 0;

  if (!hasIpRanges && !hasDomains) {
    return { valid: false, error: "At least one IP range or domain is required" };
  }

  if (hasDomains) {
    const wildcardDomains = domains.filter((d) => d.startsWith("*.") || d.startsWith("*"));
    if (wildcardDomains.length > 0) {
      return { valid: false, error: "Wildcard domains are not supported. Please enter specific domain names." };
    }

    if (domains.length > MAX_DOMAINS) {
      return { valid: false, error: `Maximum ${MAX_DOMAINS} domains allowed per discovery` };
    }
  }

  if (!hasIpRanges && hasDomains) {
    return { valid: true, ipCount: 0, portCount: parsedPorts.length };
  }

  if (hasIpRanges) {
    const cidrRanges = ipRanges.filter((r) => r.includes("/"));
    const singleIps = ipRanges.filter((r) => !r.includes("/"));

    if (cidrRanges.length > 0 && singleIps.length > 0) {
      return { valid: false, error: "Cannot mix CIDR ranges with individual IPs. Use one or the other." };
    }

    if (cidrRanges.length > 1) {
      return { valid: false, error: "Only one CIDR range allowed per discovery job" };
    }

    if (shouldBlockPrivateIps(!!hasGateway)) {
      const privateIp = singleIps.find((ip) => isPrivateIp(ip));
      if (privateIp) {
        return {
          valid: false,
          error: "Private/internal IP addresses require a gateway. Use a gateway to scan private networks."
        };
      }
      const privateCidr = cidrRanges.find((cidr) => isPrivateIp(cidr.split("/")[0]));
      if (privateCidr) {
        return {
          valid: false,
          error: "Private/internal CIDR ranges require a gateway. Use a gateway to scan private networks."
        };
      }
    }

    if (cidrRanges.length === 1) {
      const cidr = cidrRanges[0];
      const prefixMatch = cidr.match(new RE2("\\/([0-9]+)$"));
      if (!prefixMatch) {
        return { valid: false, error: `Invalid CIDR notation: ${cidr}` };
      }
      const prefix = parseInt(prefixMatch[1], 10);
      if (prefix < MIN_CIDR_PREFIX) {
        return {
          valid: false,
          error: `CIDR range too large. Maximum is /${MIN_CIDR_PREFIX} (256 IPs). Got /${prefix}`
        };
      }

      const ipCount = 2 ** (32 - prefix);
      return { valid: true, ipCount, portCount: parsedPorts.length };
    }

    if (singleIps.length > MAX_IPS) {
      return { valid: false, error: `Maximum ${MAX_IPS} individual IPs allowed` };
    }

    return { valid: true, ipCount: singleIps.length, portCount: parsedPorts.length };
  }

  return { valid: true, ipCount: 0, portCount: parsedPorts.length };
};

export const parsePorts = (portsStr: string | undefined, maxPorts = MAX_PORTS): number[] => {
  if (!portsStr || !portsStr.trim()) {
    return [];
  }

  const ports = new Set<number>();
  const parts = portsStr.split(",").map((p) => p.trim());

  for (const part of parts) {
    if (ports.size >= maxPorts) break;

    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((p) => p.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!Number.isNaN(start) && !Number.isNaN(end) && start >= 1 && end <= 65535 && start <= end) {
        for (let p = start; p <= end && ports.size < maxPorts; p += 1) {
          ports.add(p);
        }
      }
    } else {
      const port = parseInt(part, 10);
      if (!Number.isNaN(port) && port >= 1 && port <= 65535) {
        ports.add(port);
      }
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
};

const isIpAddress = (host: string): boolean => {
  return net.isIP(host) !== 0;
};

export const scanEndpoint = async (
  host: string,
  port: number,
  timeout = TLS_SCAN_TIMEOUT,
  sniHostname?: string
): Promise<TScanEndpointResult> => {
  return new Promise((resolve) => {
    const certificates: TScanCertificateResult[] = [];

    let servername: string | undefined;
    if (sniHostname) {
      servername = sniHostname;
    } else if (!isIpAddress(host)) {
      servername = host;
    }
    const socket = tls.connect(
      {
        host,
        port,
        servername,
        rejectUnauthorized: false,
        timeout,
        minVersion: "TLSv1.2"
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          if (cert && Object.keys(cert).length > 0) {
            let currentCert: tls.DetailedPeerCertificate | undefined = cert;
            const seenFingerprints = new Set<string>();
            const chainPems: string[] = [];
            let leafCertResult: TScanCertificateResult | null = null;

            while (currentCert && !seenFingerprints.has(currentCert.fingerprint256)) {
              seenFingerprints.add(currentCert.fingerprint256);

              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              const certResult = parsePeerCertificate(currentCert);
              if (certResult) {
                if (certResult.pemChain.length > 0) {
                  chainPems.push(certResult.pemChain[0]);
                }
                if (!leafCertResult) {
                  leafCertResult = certResult;
                }
              }

              currentCert = currentCert.issuerCertificate;
              if (currentCert && currentCert.fingerprint256 === cert.fingerprint256) {
                break;
              }
            }

            if (leafCertResult) {
              leafCertResult.pemChain = chainPems;
              certificates.push(leafCertResult);
            }
          }

          socket.end();
          resolve({
            success: true,
            host,
            port,
            certificates
          });
        } catch (error) {
          socket.end();
          resolve({
            success: false,
            host,
            port,
            error: error instanceof Error ? error.message : "Failed to parse certificate",
            failureReason: ScanEndpointFailureReason.CertificateParseError
          });
        }
      }
    );

    // Connection-level failures are expected when scanning IP ranges.
    // Most endpoints won't have TLS — these are not real errors.
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        success: false,
        host,
        port,
        failureReason: ScanEndpointFailureReason.ConnectionFailed
      });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({
        success: false,
        host,
        port,
        failureReason: ScanEndpointFailureReason.ConnectionFailed
      });
    });
  });
};

const parsePeerCertificate = (cert: tls.DetailedPeerCertificate): TScanCertificateResult | null => {
  try {
    const derBuffer = cert.raw;
    const b64 = derBuffer.toString("base64");
    const lines: string[] = [];
    for (let i = 0; i < b64.length; i += 64) {
      lines.push(b64.substring(i, i + 64));
    }
    const pem = `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;

    let altNames: string | undefined;
    if (cert.subjectaltname) {
      altNames = cert.subjectaltname
        .split(", ")
        .map((entry) => {
          const colonIdx = entry.indexOf(":");
          return colonIdx >= 0 ? entry.substring(colonIdx + 1) : entry;
        })
        .filter(Boolean)
        .join(", ");
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const fingerprint = computeCertFingerprint(derBuffer);

    const subject = cert.subject || {};

    const x509Cert = new x509.X509Certificate(derBuffer);

    let keyUsages: CertKeyUsage[] = [];
    const keyUsagesExt = x509Cert.getExtension("2.5.29.15") as x509.KeyUsagesExtension;
    if (keyUsagesExt) {
      keyUsages = Object.values(CertKeyUsage).filter(
        // eslint-disable-next-line no-bitwise
        (keyUsage) => (x509.KeyUsageFlags[keyUsage] & keyUsagesExt.usages) !== 0
      );
    }

    let extendedKeyUsages: CertExtendedKeyUsage[] = [];
    const extKeyUsageExt = x509Cert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension;
    if (extKeyUsageExt) {
      extendedKeyUsages = extKeyUsageExt.usages
        .map((ekuOid) => CertExtendedKeyUsageOIDToName[ekuOid as string])
        .filter(Boolean);
    }

    const certAny = cert as { ca?: boolean; pathlen?: number };
    const isCA = certAny.ca;
    const pathLength = certAny.pathlen;

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const signatureAlgorithm = extractSignatureAlgorithm(x509Cert);

    return {
      pemChain: [pem],
      fingerprint,
      commonName: subject.CN || "",
      altNames,
      notBefore: new Date(cert.valid_from),
      notAfter: new Date(cert.valid_to),
      serialNumber: cert.serialNumber,
      subjectOrganization: subject.O,
      subjectOrganizationalUnit: subject.OU,
      subjectCountry: subject.C,
      subjectState: subject.ST,
      subjectLocality: subject.L,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      keyAlgorithm: extractKeyAlgorithm(cert),
      signatureAlgorithm,
      keyUsages,
      extendedKeyUsages,
      isCA,
      pathLength
    };
  } catch (error) {
    logger.error(error, "Failed to parse peer certificate");
    return null;
  }
};

const extractKeyAlgorithm = (cert: tls.DetailedPeerCertificate): string | undefined => {
  const certAny = cert as { asn1Curve?: string };
  if (cert.bits && !certAny.asn1Curve) {
    return `RSA-${cert.bits}`;
  }
  if (certAny.asn1Curve) {
    return `EC-${certAny.asn1Curve}`;
  }
  return undefined;
};

const SIG_ALG_MAP: Record<string, Record<string, CertSignatureAlgorithm>> = {
  "RSASSA-PKCS1-v1_5": {
    "SHA-256": CertSignatureAlgorithm.RSA_SHA256,
    "SHA-384": CertSignatureAlgorithm.RSA_SHA384,
    "SHA-512": CertSignatureAlgorithm.RSA_SHA512
  },
  ECDSA: {
    "SHA-256": CertSignatureAlgorithm.ECDSA_SHA256,
    "SHA-384": CertSignatureAlgorithm.ECDSA_SHA384,
    "SHA-512": CertSignatureAlgorithm.ECDSA_SHA512
  }
};

const extractSignatureAlgorithm = (x509Cert: x509.X509Certificate): CertSignatureAlgorithm | undefined => {
  try {
    const { name } = x509Cert.signatureAlgorithm;
    const hashName = (x509Cert.signatureAlgorithm as { hash?: { name?: string } }).hash?.name;
    if (!hashName) return undefined;

    return SIG_ALG_MAP[name]?.[hashName];
  } catch {
    return undefined;
  }
};

export const computeCertFingerprint = (derBuffer: Buffer): string => {
  return crypto.createHash("sha256").update(derBuffer).digest("hex").toUpperCase();
};

export const expandCIDR = (cidr: string, maxHosts = 256): string[] => {
  try {
    const block = new Netmask(cidr);
    const ips: string[] = [];

    block.forEach((ip) => {
      if (ips.length < maxHosts) {
        ips.push(ip);
      }
    });

    return ips;
  } catch {
    return [cidr];
  }
};

const resolveWithDnsServer = async (
  domain: string,
  dnsServers: string[],
  recordType: "A" | "AAAA" = "A"
): Promise<string[]> => {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    resolver.setServers(dnsServers);

    const timeout = setTimeout(() => {
      resolver.cancel();
      resolve([]);
    }, DNS_RESOLUTION_TIMEOUT);

    const callback = (err: NodeJS.ErrnoException | null, addresses: string[]) => {
      clearTimeout(timeout);
      if (err) {
        resolve([]);
        return;
      }
      resolve(addresses);
    };

    if (recordType === "AAAA") {
      resolver.resolve6(domain, callback);
    } else {
      resolver.resolve4(domain, callback);
    }
  });
};

const resolveSingleCname = (host: string, dnsServers: string[]): Promise<string | null> => {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    resolver.setServers(dnsServers);

    const timeout = setTimeout(() => {
      resolver.cancel();
      resolve(null);
    }, DNS_RESOLUTION_TIMEOUT);

    resolver.resolveCname(host, (err, addresses) => {
      clearTimeout(timeout);
      if (err || !addresses || addresses.length === 0) {
        resolve(null);
        return;
      }
      resolve(addresses[0]);
    });
  });
};

const resolveCnameChain = async (domain: string, dnsServers: string[]): Promise<string[]> => {
  const cnames: string[] = [];
  let current = domain;
  const maxDepth = 10;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    // eslint-disable-next-line no-await-in-loop
    const target = await resolveSingleCname(current, dnsServers);

    if (!target) break;

    cnames.push(target);
    current = target;
  }

  return cnames;
};

export const resolveDomain = async (domain: string): Promise<string[]> => {
  const allIps = new Set<string>();

  const resolverPromises = PUBLIC_DNS_RESOLVERS.flatMap(({ servers }) => [
    resolveWithDnsServer(domain, servers, "A"),
    resolveWithDnsServer(domain, servers, "AAAA"),
    resolveCnameChain(domain, servers)
  ]);

  const results = await Promise.all(resolverPromises);

  const cnameTargets = new Set<string>();

  for (const result of results) {
    for (const value of result) {
      const isIp = net.isIP(value) !== 0;
      if (isIp) {
        allIps.add(value);
      } else {
        cnameTargets.add(value);
      }
    }
  }

  if (cnameTargets.size > 0) {
    const cnameResolutions = Array.from(cnameTargets).flatMap((target) =>
      PUBLIC_DNS_RESOLVERS.flatMap(({ servers }) => [
        resolveWithDnsServer(target, servers, "A"),
        resolveWithDnsServer(target, servers, "AAAA")
      ])
    );

    const cnameResults = await Promise.all(cnameResolutions);
    for (const ips of cnameResults) {
      for (const ip of ips) {
        allIps.add(ip);
      }
    }
  }

  const uniqueIps = Array.from(allIps);

  if (uniqueIps.length === 0) {
    logger.warn({ domain }, "Domain could not be resolved by any DNS resolver");
  }

  return uniqueIps;
};

export const resolveTargets = async (
  targetConfig: TPkiDiscoveryTargetConfig,
  hasGateway = false
): Promise<TScanTarget[]> => {
  const targets: TScanTarget[] = [];
  const ports = parsePorts(targetConfig.ports);
  const blockPrivate = shouldBlockPrivateIps(hasGateway);

  if (targetConfig.domains) {
    for (const domain of targetConfig.domains) {
      // eslint-disable-next-line no-await-in-loop
      const resolvedIps = await resolveDomain(domain);

      if (blockPrivate) {
        // When blocking private IPs, only use public IPs and never pass raw domains
        // to scanEndpoint — it would re-resolve via system DNS, bypassing the check.
        const publicIps = resolvedIps.filter((ip) => !isPrivateIp(ip));

        for (const ip of publicIps) {
          for (const port of ports) {
            targets.push({
              host: ip,
              port,
              isResolved: true,
              originalTarget: domain,
              sniHostname: domain
            });
          }
        }

        // eslint-disable-next-line no-continue
        continue;
      }

      if (resolvedIps.length === 0) {
        for (const port of ports) {
          targets.push({
            host: domain,
            port,
            isResolved: false,
            originalTarget: domain
          });
        }
      } else {
        for (const ip of resolvedIps) {
          for (const port of ports) {
            targets.push({
              host: ip,
              port,
              isResolved: true,
              originalTarget: domain,
              sniHostname: domain
            });
          }
        }
      }
    }
  }

  if (targetConfig.ipRanges) {
    for (const range of targetConfig.ipRanges) {
      const ips = expandCIDR(range, MAX_IPS);

      for (const ip of ips) {
        for (const port of ports) {
          targets.push({
            host: ip,
            port,
            isResolved: true,
            originalTarget: range
          });
        }
      }
    }
  }

  return targets;
};

export const computeLocationFingerprint = (
  locationType: PkiInstallationLocationType,
  locationDetails: TPkiInstallationLocationDetails,
  gatewayId?: string
): string => {
  const parts: string[] = [locationType];

  if (locationDetails.ipAddress) parts.push(`ip:${locationDetails.ipAddress}`);
  if (locationDetails.fqdn) parts.push(`fqdn:${locationDetails.fqdn}`);
  if (locationDetails.port) parts.push(`port:${locationDetails.port}`);
  if (locationDetails.filePath) parts.push(`path:${locationDetails.filePath}`);
  if (gatewayId) parts.push(`gw:${gatewayId}`);

  const input = parts.join("|");
  return crypto.createHash("sha256").update(input).digest("hex");
};
