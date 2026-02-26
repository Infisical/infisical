import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import {
  faCheckCircle,
  faChevronLeft,
  faChevronRight,
  faDownload,
  faFilter,
  faMagnifyingGlass,
  faRotateRight,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  PageHeader
} from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

const tabs = ["Endpoints", "Keys", "Certificates", "Protocols"] as const;
type Tab = (typeof tabs)[number];

const endpointData = [
  { scanId: "SCN-0041", country: "US", host: "10.0.1.15", port: 443, protocol: "TLS", version: "1.3", cipher: "TLS_AES_256_GCM_SHA384", strength: "HIGH" },
  { scanId: "SCN-0042", country: "US", host: "10.0.1.22", port: 443, protocol: "TLS", version: "1.2", cipher: "ECDHE-RSA-AES128-GCM-SHA256", strength: "MEDIUM" },
  { scanId: "SCN-0043", country: "DE", host: "172.16.3.8", port: 8443, protocol: "TLS", version: "1.3", cipher: "TLS_CHACHA20_POLY1305_SHA256", strength: "HIGH" },
  { scanId: "SCN-0044", country: "GB", host: "192.168.1.50", port: 443, protocol: "TLS", version: "1.0", cipher: "DHE-RSA-AES128-SHA", strength: "LOW" },
  { scanId: "SCN-0045", country: "US", host: "10.0.2.100", port: 443, protocol: "TLS", version: "1.2", cipher: "ECDHE-ECDSA-AES256-GCM-SHA384", strength: "HIGH" },
  { scanId: "SCN-0046", country: "JP", host: "10.0.5.33", port: 443, protocol: "SSL", version: "3.0", cipher: "RC4-SHA", strength: "LOW" },
  { scanId: "SCN-0047", country: "US", host: "172.16.0.12", port: 8443, protocol: "TLS", version: "1.3", cipher: "TLS_AES_128_GCM_SHA256", strength: "HIGH" },
  { scanId: "SCN-0048", country: "FR", host: "10.0.3.77", port: 443, protocol: "TLS", version: "1.2", cipher: "AES256-GCM-SHA384", strength: "MEDIUM" },
  { scanId: "SCN-0049", country: "IN", host: "10.0.4.91", port: 8080, protocol: "TLS", version: "1.0", cipher: "DES-CBC3-SHA", strength: "LOW", expiredCert: true }
];

const keysData = [
  { keyId: "key-a1b2c3", project: "Secrets-Prod", type: "Asymmetric", algo: "RSA", length: 2048, pqcSafe: false, created: "Jan 15, 2025", expires: "Jan 15, 2027", violations: 3 },
  { keyId: "key-d4e5f6", project: "KMS_TEST", type: "Asymmetric", algo: "ML-KEM-768", length: 768, pqcSafe: true, created: "Feb 01, 2026", expires: "Feb 01, 2028", violations: 0 },
  { keyId: "key-g7h8i9", project: "Secrets-Staging", type: "Symmetric", algo: "AES", length: 256, pqcSafe: true, created: "Mar 10, 2025", expires: "Mar 10, 2027", violations: 0 },
  { keyId: "key-j1k2l3", project: "KMS_TEST", type: "Asymmetric", algo: "ECDSA", length: 256, pqcSafe: false, created: "Jun 20, 2024", expires: "Jun 20, 2026", violations: 2 },
  { keyId: "key-m4n5o6", project: "Secrets-Prod", type: "Symmetric", algo: "AES", length: 128, pqcSafe: false, created: "Aug 05, 2024", expires: "Aug 05, 2026", violations: 1 },
  { keyId: "key-p7q8r9", project: "KMS_TEST", type: "Asymmetric", algo: "RSA", length: 4096, pqcSafe: false, created: "Dec 12, 2024", expires: "Dec 12, 2026", violations: 1 }
];

const certsData = [
  { cn: "*.acmecorp.com", serial: "3A:F2:1B:9C:04:D8", source: "Managed", status: "Healthy", issued: "Jan 10, 2026", expires: "Jan 10, 2027", algo: "ECDSA-256", pqcSafe: false, violations: 0 },
  { cn: "api.acmecorp.com", serial: "7B:E4:2C:A1:08:F3", source: "Discovered", status: "Expired", issued: "Nov 01, 2024", expires: "Nov 01, 2025", algo: "RSA-2048", pqcSafe: false, violations: 2 },
  { cn: "db.internal.corp", serial: "1D:C8:3E:B5:0A:27", source: "Imported", status: "Expiring Soon", issued: "Aug 15, 2025", expires: "Mar 02, 2026", algo: "RSA-2048", pqcSafe: false, violations: 1 },
  { cn: "mail.acmecorp.com", serial: "9F:A6:4D:C2:0E:19", source: "Managed", status: "Healthy", issued: "Feb 20, 2026", expires: "Feb 20, 2027", algo: "Ed25519", pqcSafe: true, violations: 0 },
  { cn: "vault.acmecorp.com", serial: "5E:B1:7A:D9:02:84", source: "Discovered", status: "Revoked", issued: "Sep 05, 2024", expires: "Sep 05, 2025", algo: "RSA-4096", pqcSafe: false, violations: 1 },
  { cn: "cdn.acmecorp.com", serial: "2C:D7:8F:E4:06:B5", source: "Managed", status: "Healthy", issued: "Dec 01, 2025", expires: "Dec 01, 2026", algo: "ECDSA-384", pqcSafe: false, violations: 0 }
];

const protocolsData = [
  { host: "10.0.1.15", port: 443, protocol: "TLS", version: "1.3", cipher: "TLS_AES_256_GCM_SHA384", strength: "HIGH", itAsset: "Web Server Prod", lastScanned: "Feb 24, 2026" },
  { host: "10.0.1.22", port: 443, protocol: "TLS", version: "1.2", cipher: "ECDHE-RSA-AES128-GCM-SHA256", strength: "MEDIUM", itAsset: "API Gateway", lastScanned: "Feb 24, 2026" },
  { host: "172.16.3.8", port: 8443, protocol: "TLS", version: "1.3", cipher: "TLS_CHACHA20_POLY1305_SHA256", strength: "HIGH", itAsset: "Database Cluster", lastScanned: "Feb 23, 2026" },
  { host: "192.168.1.50", port: 443, protocol: "TLS", version: "1.0", cipher: "DHE-RSA-AES128-SHA", strength: "LOW", itAsset: "Legacy App", lastScanned: "Feb 22, 2026" },
  { host: "10.0.5.33", port: 443, protocol: "SSL", version: "3.0", cipher: "RC4-SHA", strength: "LOW", itAsset: "Staging Server", lastScanned: "Feb 24, 2026" }
];

function StrengthBadge({ strength }: { strength: string }) {
  const cls =
    strength === "HIGH"
      ? "text-green-400"
      : strength === "MEDIUM"
        ? "text-yellow-400"
        : "text-red-400";
  return <span className={`text-[11px] ${cls}`}>{strength}</span>;
}

function VersionBadge({ version }: { version: string }) {
  const cls =
    version === "1.3" ? "text-green-400" : version === "1.2" ? "text-yellow-400" : "text-red-400";
  return <span className={`font-mono text-xs ${cls}`}>{version}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Healthy"
      ? "text-green-400"
      : status === "Expired" || status === "Revoked"
        ? "text-red-400"
        : "text-yellow-400";
  return <span className={`text-[11px] ${cls}`}>{status}</span>;
}

function AssetDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-mineshaft-600 bg-mineshaft-800 shadow-2xl">
      <div className="flex items-center justify-between border-b border-mineshaft-600 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-mineshaft-100">10.0.1.15</h3>
          <span className="rounded bg-mineshaft-600 px-1.5 py-0.5 text-[10px] text-mineshaft-400">
            Endpoint
          </span>
        </div>
        <IconButton
          ariaLabel="Close drawer"
          variant="plain"
          onClick={onClose}
          className="text-mineshaft-400 hover:text-mineshaft-100"
        >
          <FontAwesomeIcon icon={faXmark} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Overview
          </h4>
          <div className="flex flex-col gap-2 text-xs">
            {[
              ["Host", "10.0.1.15"],
              ["Port", "443"],
              ["Protocol", "TLS 1.3"],
              ["Cipher Suite", "TLS_AES_256_GCM_SHA384"],
              ["Strength", "HIGH"],
              ["Country", "US"]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-mineshaft-400">{label}</span>
                <span className="font-mono text-mineshaft-100">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Linked IT Asset
          </h4>
          <span className="cursor-pointer text-sm text-blue-400 hover:underline">
            Web Server Prod
          </span>
          <span className="ml-2 text-xs text-mineshaft-400">(Service)</span>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            PQC Status
          </h4>
          <span className="text-xs text-green-400">Safe</span>
          <p className="mt-2 text-xs text-mineshaft-400">
            TLS 1.3 with AES-256-GCM provides quantum-resistant symmetric encryption.
          </p>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Policy Violations
          </h4>
          <p className="text-xs text-green-400">No violations</p>
        </div>

        <div className="border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Remediation
          </h4>
          <p className="text-xs text-mineshaft-400">
            No action needed. This endpoint is using PQC-safe configurations.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-t border-mineshaft-600 px-5 py-3">
        <button
          type="button"
          className="flex-1 rounded-md border border-mineshaft-500 bg-transparent px-3 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
        >
          Create Ticket
        </button>
        <button
          type="button"
          className="rounded-md border border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-100 hover:bg-mineshaft-700"
        >
          View Source
        </button>
        <button
          type="button"
          className="rounded-md border border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-100 hover:bg-mineshaft-700"
        >
          Export
        </button>
      </div>
    </div>
  );
}

type Filters = {
  strength: string;
  version: string;
  keyType: string;
  pqcSafe: string;
  certSource: string;
  certStatus: string;
};

const defaultFilters: Filters = {
  strength: "",
  version: "",
  keyType: "",
  pqcSafe: "",
  certSource: "",
  certStatus: ""
};

const selectClass =
  "rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-200 outline-none";

const thClass =
  "px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-mineshaft-400";
const tdClass = "px-4 py-3 text-xs";
const trClass =
  "cursor-pointer border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700";

export const CryptographicAssetsPage = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("Endpoints");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const isFiltered = useMemo(() => {
    switch (activeTab) {
      case "Endpoints":
      case "Protocols":
        return filters.strength !== "" || filters.version !== "";
      case "Keys":
        return filters.keyType !== "" || filters.pqcSafe !== "";
      case "Certificates":
        return filters.certSource !== "" || filters.certStatus !== "";
      default:
        return false;
    }
  }, [activeTab, filters]);

  const filteredEndpoints = useMemo(() => {
    let data = endpointData;
    if (filters.strength) data = data.filter((r) => r.strength === filters.strength);
    if (filters.version) data = data.filter((r) => r.version === filters.version);
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.scanId.toLowerCase().includes(q) ||
        r.country.toLowerCase().includes(q) ||
        r.host.toLowerCase().includes(q) ||
        String(r.port).includes(q) ||
        r.protocol.toLowerCase().includes(q) ||
        r.version.toLowerCase().includes(q) ||
        r.cipher.toLowerCase().includes(q) ||
        r.strength.toLowerCase().includes(q)
    );
  }, [searchQuery, filters]);

  const filteredKeys = useMemo(() => {
    let data = keysData;
    if (filters.keyType) data = data.filter((r) => r.type === filters.keyType);
    if (filters.pqcSafe) data = data.filter((r) => (filters.pqcSafe === "Safe") === r.pqcSafe);
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.keyId.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.algo.toLowerCase().includes(q) ||
        String(r.length).includes(q)
    );
  }, [searchQuery, filters]);

  const filteredCerts = useMemo(() => {
    let data = certsData;
    if (filters.certSource) data = data.filter((r) => r.source === filters.certSource);
    if (filters.certStatus) data = data.filter((r) => r.status === filters.certStatus);
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.cn.toLowerCase().includes(q) ||
        r.serial.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.algo.toLowerCase().includes(q)
    );
  }, [searchQuery, filters]);

  const filteredProtocols = useMemo(() => {
    let data = protocolsData;
    if (filters.strength) data = data.filter((r) => r.strength === filters.strength);
    if (filters.version) data = data.filter((r) => r.version === filters.version);
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.host.toLowerCase().includes(q) ||
        String(r.port).includes(q) ||
        r.protocol.toLowerCase().includes(q) ||
        r.version.toLowerCase().includes(q) ||
        r.cipher.toLowerCase().includes(q) ||
        r.strength.toLowerCase().includes(q) ||
        r.itAsset.toLowerCase().includes(q)
    );
  }, [searchQuery, filters]);

  const activeData = useMemo(() => {
    switch (activeTab) {
      case "Endpoints": return filteredEndpoints;
      case "Keys": return filteredKeys;
      case "Certificates": return filteredCerts;
      case "Protocols": return filteredProtocols;
      default: return [];
    }
  }, [activeTab, filteredEndpoints, filteredKeys, filteredCerts, filteredProtocols]);

  const totalRows = activeData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
  const paginatedData = activeData.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Cryptographic Assets" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Cryptographic Assets"
          description="Complete inventory of cryptographic objects discovered across your organization."
        />

        {/* Tab bar */}
        <div className="mb-4 flex items-center border-b border-mineshaft-600">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setPage(1); setFilters(defaultFilters); }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-mineshaft-100 text-mineshaft-100"
                  : "text-mineshaft-400 hover:text-mineshaft-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="mr-2 h-3.5 w-3.5 text-mineshaft-400"
              />
              <input
                type="text"
                placeholder="Search by host, key ID, CN, algorithm..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-64 bg-transparent text-xs text-mineshaft-100 placeholder-mineshaft-500 outline-none"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  ariaLabel="Filter"
                  variant="outline_bg"
                  size="xs"
                  className={twMerge(
                    "flex items-center gap-1.5 rounded-md border border-mineshaft-600 px-3 py-1.5 text-xs text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-100",
                    isFiltered && "border-primary/50 text-primary"
                  )}
                >
                  <FontAwesomeIcon icon={isFiltered ? faCheckCircle : faFilter} className="h-3.5 w-3.5" />
                  Filter
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px] p-3">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => setFilters(defaultFilters)}
                    className="mb-2 w-full rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
                  >
                    Clear filters
                  </button>
                )}

                {(activeTab === "Endpoints" || activeTab === "Protocols") && (
                  <>
                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      Strength
                    </DropdownMenuLabel>
                    <select
                      value={filters.strength}
                      onChange={(e) => { setFilters((f) => ({ ...f, strength: e.target.value })); setPage(1); }}
                      className={`${selectClass} mb-3 w-full`}
                    >
                      <option value="">All</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>

                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      Version
                    </DropdownMenuLabel>
                    <select
                      value={filters.version}
                      onChange={(e) => { setFilters((f) => ({ ...f, version: e.target.value })); setPage(1); }}
                      className={`${selectClass} w-full`}
                    >
                      <option value="">All</option>
                      <option value="1.0">1.0</option>
                      <option value="1.2">1.2</option>
                      <option value="1.3">1.3</option>
                      <option value="3.0">3.0</option>
                    </select>
                  </>
                )}

                {activeTab === "Keys" && (
                  <>
                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      Type
                    </DropdownMenuLabel>
                    <select
                      value={filters.keyType}
                      onChange={(e) => { setFilters((f) => ({ ...f, keyType: e.target.value })); setPage(1); }}
                      className={`${selectClass} mb-3 w-full`}
                    >
                      <option value="">All</option>
                      <option value="Asymmetric">Asymmetric</option>
                      <option value="Symmetric">Symmetric</option>
                    </select>

                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      PQC Safe
                    </DropdownMenuLabel>
                    <select
                      value={filters.pqcSafe}
                      onChange={(e) => { setFilters((f) => ({ ...f, pqcSafe: e.target.value })); setPage(1); }}
                      className={`${selectClass} w-full`}
                    >
                      <option value="">All</option>
                      <option value="Safe">Safe</option>
                      <option value="Unsafe">Unsafe</option>
                    </select>
                  </>
                )}

                {activeTab === "Certificates" && (
                  <>
                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      Source
                    </DropdownMenuLabel>
                    <select
                      value={filters.certSource}
                      onChange={(e) => { setFilters((f) => ({ ...f, certSource: e.target.value })); setPage(1); }}
                      className={`${selectClass} mb-3 w-full`}
                    >
                      <option value="">All</option>
                      <option value="Managed">Managed</option>
                      <option value="Discovered">Discovered</option>
                      <option value="Imported">Imported</option>
                    </select>

                    <DropdownMenuLabel className="mb-1 text-[11px] text-mineshaft-400">
                      Status
                    </DropdownMenuLabel>
                    <select
                      value={filters.certStatus}
                      onChange={(e) => { setFilters((f) => ({ ...f, certStatus: e.target.value })); setPage(1); }}
                      className={`${selectClass} w-full`}
                    >
                      <option value="">All</option>
                      <option value="Healthy">Healthy</option>
                      <option value="Expired">Expired</option>
                      <option value="Expiring Soon">Expiring Soon</option>
                      <option value="Revoked">Revoked</option>
                    </select>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-mineshaft-600 px-3 py-1.5 text-xs text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-100"
            >
              <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-mineshaft-600 px-3 py-1.5 text-xs text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-100"
            >
              <FontAwesomeIcon icon={faRotateRight} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
          {activeTab === "Endpoints" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-mineshaft-600 bg-mineshaft-900">
                  {["SCAN ID", "COUNTRY", "HOST", "PORT", "PROTOCOL", "VERSION", "CIPHER SUITE", "STRENGTH", "FLAGS"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedData as typeof endpointData).map((row, i) => (
                  <tr key={i} className={trClass} onClick={() => setDrawerOpen(true)}>
                    <td className={`${tdClass} font-mono text-mineshaft-100`}>{row.scanId}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.country}</td>
                    <td className={`${tdClass} font-mono text-mineshaft-100`}>{row.host}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.port}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.protocol}</td>
                    <td className={tdClass}><VersionBadge version={row.version} /></td>
                    <td className={`${tdClass} font-mono text-mineshaft-400`}>{row.cipher}</td>
                    <td className={tdClass}><StrengthBadge strength={row.strength} /></td>
                    <td className={tdClass}>
                      {"expiredCert" in row && row.expiredCert ? (
                        <div className="flex gap-1">
                          <span className="rounded bg-red-400/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Expired Cert</span>
                          <span className="rounded bg-red-400/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Weak Protocol</span>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "Keys" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-mineshaft-600 bg-mineshaft-900">
                  {["KEY ID", "SOURCE PROJECT", "TYPE", "ALGORITHM", "KEY LENGTH", "PQC SAFE?", "CREATED", "EXPIRES", "VIOLATIONS"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedData as typeof keysData).map((row, i) => (
                  <tr key={i} className={trClass} onClick={() => setDrawerOpen(true)}>
                    <td className={`${tdClass} font-mono text-mineshaft-100`}>{row.keyId}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.project}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.type}</td>
                    <td className={`${tdClass} text-mineshaft-100`}>{row.algo}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.length}</td>
                    <td className={tdClass}>
                      <span className={`text-[11px] ${row.pqcSafe ? "text-green-400" : "text-red-400"}`}>
                        {row.pqcSafe ? "Safe" : "Unsafe"}
                      </span>
                    </td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.created}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.expires}</td>
                    <td className={tdClass}>
                      {row.violations > 0 ? (
                        <span className="text-mineshaft-400">{row.violations}</span>
                      ) : (
                        <span className="text-mineshaft-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "Certificates" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-mineshaft-600 bg-mineshaft-900">
                  {["CN / SAN", "SERIAL NUMBER", "SOURCE", "STATUS", "ISSUED AT", "EXPIRING AT", "ALGORITHM", "PQC SAFE?", "VIOLATIONS"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedData as typeof certsData).map((row, i) => (
                  <tr key={i} className={trClass} onClick={() => setDrawerOpen(true)}>
                    <td className={`${tdClass} text-mineshaft-100`}>{row.cn}</td>
                    <td className={`${tdClass} font-mono text-[11px] text-mineshaft-400`}>{row.serial}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.source}</td>
                    <td className={tdClass}><StatusBadge status={row.status} /></td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.issued}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.expires}</td>
                    <td className={`${tdClass} text-mineshaft-100`}>{row.algo}</td>
                    <td className={tdClass}>
                      <span className={`text-[11px] ${row.pqcSafe ? "text-green-400" : "text-red-400"}`}>
                        {row.pqcSafe ? "Safe" : "Unsafe"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {row.violations > 0 ? (
                        <span className="text-mineshaft-400">{row.violations}</span>
                      ) : (
                        <span className="text-mineshaft-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "Protocols" && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-mineshaft-600 bg-mineshaft-900">
                  {["HOST", "PORT", "PROTOCOL", "VERSION", "CIPHER SUITE", "STRENGTH", "IT ASSET", "LAST SCANNED"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(paginatedData as typeof protocolsData).map((row, i) => (
                  <tr key={i} className={trClass} onClick={() => setDrawerOpen(true)}>
                    <td className={`${tdClass} font-mono text-mineshaft-100`}>{row.host}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.port}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.protocol}</td>
                    <td className={tdClass}><VersionBadge version={row.version} /></td>
                    <td className={`${tdClass} font-mono text-mineshaft-400`}>{row.cipher}</td>
                    <td className={tdClass}><StrengthBadge strength={row.strength} /></td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.itAsset}</td>
                    <td className={`${tdClass} text-mineshaft-400`}>{row.lastScanned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer pagination */}
        <div className="mt-4 flex items-center justify-between text-xs text-mineshaft-400">
          <span>Total rows: {totalRows.toLocaleString()}</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span>Items per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="rounded border border-mineshaft-600 bg-mineshaft-900 px-2 py-1 text-xs text-mineshaft-100 outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded p-1 hover:bg-mineshaft-700 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
              </button>
              <span className="text-mineshaft-100">{page} of {totalPages.toLocaleString()}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded p-1 hover:bg-mineshaft-700 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Drawer */}
        {drawerOpen && <AssetDrawer onClose={() => setDrawerOpen(false)} />}
      </div>
    </div>
  );
};
