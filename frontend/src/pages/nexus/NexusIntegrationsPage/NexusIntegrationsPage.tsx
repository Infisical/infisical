import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

const subNavItems = [
  "Ticket Systems",
  "Alerting & Notifications",
  "SIEM / SOAR",
  "Cloud Providers",
  "External Scanners"
] as const;
type SubNav = (typeof subNavItems)[number];

const ticketIntegrations = [
  { name: "Jira Cloud - INFRA", system: "Jira Cloud", project: "INFRA", trigger: "Critical + High Violations", status: "Active", lastSync: "Feb 24, 2026" },
  { name: "ServiceNow - SEC", system: "ServiceNow", project: "SEC-OPS", trigger: "All Violations", status: "Active", lastSync: "Feb 24, 2026" },
  { name: "Linear - Crypto Team", system: "Linear", project: "CRY", trigger: "New Critical Violations", status: "Paused", lastSync: "Feb 20, 2026" }
];

const alertIntegrations = [
  { name: "Cert Expiry Alert", event: "Certificate Expiry (< 10 days)", channel: "Slack (#security-alerts)", threshold: "< 10 days", status: "Active", lastTriggered: "Feb 23, 2026" },
  { name: "Critical Violation Alert", event: "New Critical Violation", channel: "PagerDuty", threshold: "-", status: "Active", lastTriggered: "Feb 24, 2026" },
  { name: "Risk Score Alert", event: "Risk Score > 5.0", channel: "Email (security@acmecorp.com)", threshold: "> 5.0", status: "Active", lastTriggered: "Never" },
  { name: "Scan Complete", event: "Discovery Scan Completed", channel: "Slack (#infra)", threshold: "-", status: "Active", lastTriggered: "Feb 24, 2026" }
];

const siemConnections = [
  { name: "Splunk Production", platform: "Splunk", exportType: "Real-time Stream", status: "Active", lastExport: "Feb 24, 2026" },
  { name: "Sentinel SOC", platform: "Microsoft Sentinel", exportType: "Batch (Hourly)", status: "Active", lastExport: "Feb 24, 2026" }
];

const cloudProviders = [
  { provider: "AWS", name: "AWS ACM Sync", source: "us-east-1, us-west-2", status: "Synced", lastSynced: "Feb 24, 2026" },
  { provider: "AWS", name: "AWS KMS Sync", source: "us-east-1", status: "Synced", lastSynced: "Feb 24, 2026" },
  { provider: "Azure", name: "Azure Key Vault", source: "prod-keyvault", status: "Synced", lastSynced: "Feb 23, 2026" },
  { provider: "GCP", name: "GCP CAS", source: "project-crypto", status: "Error", lastSynced: "Feb 20, 2026" }
];

const externalScanners = [
  { name: "Qualys TLS Scan", platform: "Qualys", source: "External Perimeter Scan", status: "Active", lastImport: "Feb 22, 2026" },
  { name: "Shodan Monitor", platform: "Shodan", source: "acmecorp.com domains", status: "Active", lastImport: "Feb 24, 2026" }
];

function IntegrationStatusBadge({ status }: { status: string }) {
  const cls =
    status === "Active" || status === "Synced"
      ? "text-green-400"
      : status === "Error"
        ? "text-red-400"
        : "text-mineshaft-400";
  return <span className={`text-[11px] ${cls}`}>{status}</span>;
}

const thClass =
  "px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-mineshaft-400";

export const NexusIntegrationsPage = () => {
  const { t } = useTranslation();
  const [activeSubNav, setActiveSubNav] = useState<SubNav>("Ticket Systems");

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Integrations" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Integrations"
          description="Connect Nexus to external tools for ticket management, alerting, and asset discovery."
        />

        <div className="flex gap-6">
          {/* Left sub-nav */}
          <div className="w-[180px] shrink-0">
            <nav className="flex flex-col gap-0.5">
              {subNavItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActiveSubNav(item)}
                  className={`border-l-2 px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                    activeSubNav === item
                      ? "border-mineshaft-100 text-mineshaft-100"
                      : "border-transparent text-mineshaft-400 hover:text-mineshaft-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1">
            {activeSubNav === "Ticket Systems" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">
                      Ticket System Integrations
                    </h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Automatically create tickets when violations are detected.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Add Integration
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["NAME", "SYSTEM", "PROJECT/QUEUE", "TRIGGER", "STATUS", "LAST SYNC", ""].map(
                        (h) => (
                          <th key={h} className={thClass}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ticketIntegrations.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.system}</td>
                        <td className="px-4 py-3 font-mono text-xs text-mineshaft-400">
                          {item.project}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.trigger}</td>
                        <td className="px-4 py-3">
                          <IntegrationStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.lastSync}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "Alerting & Notifications" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">Nexus Alerts</h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Configure alert channels for time-sensitive cryptographic events.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Create Alert
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["NAME", "EVENT TYPE", "CHANNEL", "THRESHOLD", "STATUS", "LAST TRIGGERED", ""].map(
                        (h) => (
                          <th key={h} className={thClass}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {alertIntegrations.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.event}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.channel}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.threshold}</td>
                        <td className="px-4 py-3">
                          <IntegrationStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">
                          {item.lastTriggered}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "SIEM / SOAR" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">SIEM Connections</h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Export cryptographic risk data to your SIEM/SOAR platforms.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Add Connection
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["NAME", "PLATFORM", "EXPORT TYPE", "STATUS", "LAST EXPORT", ""].map(
                        (h) => (
                          <th key={h} className={thClass}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {siemConnections.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.platform}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.exportType}</td>
                        <td className="px-4 py-3">
                          <IntegrationStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.lastExport}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "Cloud Providers" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">
                      Cloud Provider Connections
                    </h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Pull certificate and key data from cloud provider services.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Add Sync
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["PROVIDER", "NAME", "SOURCE", "STATUS", "LAST SYNCED", ""].map((h) => (
                        <th key={h} className={thClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cloudProviders.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3">
                          <span className="rounded bg-mineshaft-600 px-2 py-0.5 text-[10px] font-medium text-mineshaft-400">
                            {item.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-mineshaft-400">
                          {item.source}
                        </td>
                        <td className="px-4 py-3">
                          <IntegrationStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">
                          {item.lastSynced}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "External Scanners" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">
                      External Scanner Integrations
                    </h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Import results from third-party security scanning tools.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Add Scanner
                  </button>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["NAME", "PLATFORM", "SOURCE", "STATUS", "LAST IMPORT", ""].map((h) => (
                        <th key={h} className={thClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {externalScanners.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.platform}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{item.source}</td>
                        <td className="px-4 py-3">
                          <IntegrationStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">
                          {item.lastImport}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
