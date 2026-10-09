# Certificate discovery backend

Invariants for `pki-discovery-*` and `pki-installation-*` that the code doesn't state on its own.

- A discovery job (`pki_discovery_configs`) has a `discoveryType`: `network` (TLS handshakes, optional job
  gateway) or `linux-server` (files over SSH). Every type records
  its run through `pki-discovery-scan-run-fns.ts` and parses certificates with `parseCertificateDer`.
- Linux Server jobs never have their own gateway. Each SSH connection must use a gateway or pool, and the
  gateway (`packages/gateway-v2/certscan/` in the CLI repo, RPC `/v1/scan-certificates`) lists, reads and parses
  the files. Private keys never reach the backend. Old gateways lack `capabilities.certificateScan` and get an
  "update the gateway" message.
- Host scans take a per-connection slot (`tryAdmitAppConnectionConcurrency`), shared with PKI syncs.
- Nothing raw reaches users: gateway, transport and file errors map to product messages; raw text is logged.
- Installation identity is `hostIdentifier` (connection host, plus `:port` unless 22) + real path + gateway or
  pool id. The name is `<hostname>:<path>`, or `<hostIdentifier>:<path>` without a hostname, and never affects
  identity.
- Scans only add or refresh certificate links, never remove them. A certificate that left a file keeps its old
  `lastSeenAt`.
- Keystore passwords live on the installation (`encryptedCredentials`), never on the job, and are never returned
  (`sanitizePkiInstallation`). They are looked up by installation identity, not by the connection that found the
  file. Only PKCS#12 takes a password.
- Setting a password queues a single-file rescan on the `PkiDiscoveryRescan` queue (`pki-discovery-rescan-fns.ts`),
  which reads the installation from the primary.
