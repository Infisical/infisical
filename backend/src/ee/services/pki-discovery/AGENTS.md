# Certificate discovery backend

Invariants for `pki-discovery-*` and `pki-installation-*` that the code doesn't state on its own.

- A discovery job (`pki_discovery_configs`) has a `discoveryType`: `network` (TLS handshakes, optional job
  gateway), `linux-server` (files over SSH) or `windows-server` (the LocalMachine certificate store over
  WinRM). Every type records its run through `pki-discovery-scan-run-fns.ts` and parses certificates with `parseCertificateDer`.
- Linux Server jobs never have their own gateway. Each SSH connection must use a gateway or pool, and the
  gateway (`packages/gateway-v2/certscan/` in the CLI repo, RPC `/v1/scan-certificates`) lists, reads and parses
  the files. Private keys never reach the backend. Old gateways lack `capabilities.certificateScan` and get an
  "update the gateway" message.
- Windows Server discovery follows the same rules over WinRM connections: RPC `/v1/scan-certificates` on the
  WinRM ALPN, capability `windowsCertificateScan`. The gateway always reads `CA` and `Root` to build chains, but
  only returns certificates from the requested stores. Installations are `os_store`, keyed on
  `Cert:\LocalMachine\<store>\<thumbprint>` instead of a file path, and never take a password.
- Both host types share `executeHostScan`, `resolveHostConnection` and `runGatewayScan` in
  `pki-discovery-host-scan-fns.ts`; a new host type supplies one `THostScanDefinition` (label, app, capability,
  schema, per-connection scan) and adds it to the service's `HOST_DISCOVERY_TYPES` and the queue.
- Host scans take a per-connection slot (`tryAdmitAppConnectionConcurrency`), shared with PKI syncs.
- Nothing raw reaches users: gateway, transport and file errors map to product messages; raw text is logged.
- Installation identity is `hostIdentifier` (connection host, plus `:port` unless it is the protocol default: 22 for SSH, 5985 or 5986 for WinRM over HTTP or HTTPS) + real path + gateway or
  pool id. The name is `<hostname>:<path>`, or `<hostIdentifier>:<path>` without a hostname, and never affects
  identity.
- Scans only add or refresh certificate links, never remove them. A certificate that left a file keeps its old
  `lastSeenAt`.
- Keystore passwords live on the installation (`encryptedCredentials`), never on the job, and are never returned
  (`sanitizePkiInstallation`). They are looked up by installation identity, not by the connection that found the
  file. Only PKCS#12 takes a password.
- Setting a password queues a single-file rescan on the `PkiDiscoveryRescan` queue (`pki-discovery-rescan-fns.ts`),
  which reads the installation from the primary.
