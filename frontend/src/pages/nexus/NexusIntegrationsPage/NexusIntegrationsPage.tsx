import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Input,
  Modal,
  ModalContent,
  PageHeader,
  Select,
  SelectItem
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
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

// Schemas
const ticketSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  system: z.string().min(1, "System is required"),
  project: z.string().trim().min(1, "Project is required"),
  trigger: z.string().min(1, "Trigger is required")
});

const alertSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  eventType: z.string().min(1, "Event type is required"),
  channel: z.string().min(1, "Channel is required"),
  threshold: z.string().optional()
});

const siemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  platform: z.string().min(1, "Platform is required"),
  exportType: z.string().min(1, "Export type is required")
});

const cloudSyncSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  name: z.string().trim().min(1, "Name is required"),
  source: z.string().trim().min(1, "Source is required")
});

const scannerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  platform: z.string().min(1, "Platform is required"),
  source: z.string().trim().min(1, "Source is required")
});

type TTicketSchema = z.infer<typeof ticketSchema>;
type TAlertSchema = z.infer<typeof alertSchema>;
type TSiemSchema = z.infer<typeof siemSchema>;
type TCloudSyncSchema = z.infer<typeof cloudSyncSchema>;
type TScannerSchema = z.infer<typeof scannerSchema>;

function ThreeDotMenu({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-100"
        >
          <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => createNotification({ text: `Editing "${name}" coming soon.`, type: "info" })}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const NexusIntegrationsPage = () => {
  const { t } = useTranslation();
  const [activeSubNav, setActiveSubNav] = useState<SubNav>("Ticket Systems");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addIntegration",
    "createAlert",
    "addConnection",
    "addSync",
    "addScanner",
    "deleteIntegration"
  ] as const);

  // Ticket form
  const { handleSubmit: handleTicketSubmit, control: ticketControl, reset: resetTicket, formState: { isSubmitting: isTicketSubmitting } } = useForm<TTicketSchema>({ resolver: zodResolver(ticketSchema) });
  const onTicketSubmit = () => { createNotification({ text: "Ticket integration added.", type: "success" }); resetTicket(); handlePopUpToggle("addIntegration", false); };

  // Alert form
  const { handleSubmit: handleAlertSubmit, control: alertControl, reset: resetAlert, formState: { isSubmitting: isAlertSubmitting } } = useForm<TAlertSchema>({ resolver: zodResolver(alertSchema) });
  const onAlertSubmit = () => { createNotification({ text: "Alert created.", type: "success" }); resetAlert(); handlePopUpToggle("createAlert", false); };

  // SIEM form
  const { handleSubmit: handleSiemSubmit, control: siemControl, reset: resetSiem, formState: { isSubmitting: isSiemSubmitting } } = useForm<TSiemSchema>({ resolver: zodResolver(siemSchema) });
  const onSiemSubmit = () => { createNotification({ text: "SIEM connection added.", type: "success" }); resetSiem(); handlePopUpToggle("addConnection", false); };

  // Cloud sync form
  const { handleSubmit: handleCloudSubmit, control: cloudControl, reset: resetCloud, formState: { isSubmitting: isCloudSubmitting } } = useForm<TCloudSyncSchema>({ resolver: zodResolver(cloudSyncSchema) });
  const onCloudSubmit = () => { createNotification({ text: "Cloud sync added.", type: "success" }); resetCloud(); handlePopUpToggle("addSync", false); };

  // Scanner form
  const { handleSubmit: handleScannerSubmit, control: scannerControl, reset: resetScanner, formState: { isSubmitting: isScannerSubmitting } } = useForm<TScannerSchema>({ resolver: zodResolver(scannerSchema) });
  const onScannerSubmit = () => { createNotification({ text: "Scanner added.", type: "success" }); resetScanner(); handlePopUpToggle("addScanner", false); };

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
                    onClick={() => handlePopUpOpen("addIntegration")}
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
                          <ThreeDotMenu name={item.name} onDelete={() => handlePopUpOpen("deleteIntegration", { name: item.name })} />
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
                    onClick={() => handlePopUpOpen("createAlert")}
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
                          <ThreeDotMenu name={item.name} onDelete={() => handlePopUpOpen("deleteIntegration", { name: item.name })} />
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
                    onClick={() => handlePopUpOpen("addConnection")}
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
                          <ThreeDotMenu name={item.name} onDelete={() => handlePopUpOpen("deleteIntegration", { name: item.name })} />
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
                    onClick={() => handlePopUpOpen("addSync")}
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
                          <ThreeDotMenu name={item.name} onDelete={() => handlePopUpOpen("deleteIntegration", { name: item.name })} />
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
                    onClick={() => handlePopUpOpen("addScanner")}
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
                          <ThreeDotMenu name={item.name} onDelete={() => handlePopUpOpen("deleteIntegration", { name: item.name })} />
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

      {/* Add Ticket Integration Modal */}
      <Modal
        isOpen={popUp.addIntegration.isOpen}
        onOpenChange={(isOpen) => { if (!isOpen) resetTicket(); handlePopUpToggle("addIntegration", isOpen); }}
      >
        <ModalContent title="Add Ticket Integration" subTitle="Connect a ticket system for automated violation tracking.">
          <form onSubmit={handleTicketSubmit(onTicketSubmit)}>
            <Controller control={ticketControl} name="name" render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. Jira Cloud - INFRA" />
              </FormControl>
            )} />
            <Controller control={ticketControl} name="system" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="System" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select system">
                  {["Jira", "ServiceNow", "Linear", "GitHub", "Azure DevOps"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={ticketControl} name="project" render={({ field, fieldState: { error } }) => (
              <FormControl label="Project / Queue" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. INFRA or SEC-OPS" />
              </FormControl>
            )} />
            <Controller control={ticketControl} name="trigger" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Trigger" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select trigger">
                  {["All Violations", "Critical + High Violations", "New Critical Violations", "PQC Violations Only"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isTicketSubmitting} isDisabled={isTicketSubmitting} className="mr-4">Add Integration</Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetTicket(); handlePopUpToggle("addIntegration", false); }}>Cancel</Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Create Alert Modal */}
      <Modal
        isOpen={popUp.createAlert.isOpen}
        onOpenChange={(isOpen) => { if (!isOpen) resetAlert(); handlePopUpToggle("createAlert", isOpen); }}
      >
        <ModalContent title="Create Alert" subTitle="Configure a new alert for cryptographic events.">
          <form onSubmit={handleAlertSubmit(onAlertSubmit)}>
            <Controller control={alertControl} name="name" render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. Cert Expiry Alert" />
              </FormControl>
            )} />
            <Controller control={alertControl} name="eventType" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Event Type" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select event type">
                  {["Certificate Expiry", "New Critical Violation", "Risk Score Threshold", "Discovery Scan Completed", "Policy Violation"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={alertControl} name="channel" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Channel" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select channel">
                  {["Slack", "PagerDuty", "Email", "Microsoft Teams", "Webhook"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={alertControl} name="threshold" render={({ field, fieldState: { error } }) => (
              <FormControl label="Threshold" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. < 10 days or > 5.0 (optional)" />
              </FormControl>
            )} />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isAlertSubmitting} isDisabled={isAlertSubmitting} className="mr-4">Create Alert</Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetAlert(); handlePopUpToggle("createAlert", false); }}>Cancel</Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Add SIEM Connection Modal */}
      <Modal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => { if (!isOpen) resetSiem(); handlePopUpToggle("addConnection", isOpen); }}
      >
        <ModalContent title="Add SIEM Connection" subTitle="Export cryptographic risk data to a SIEM/SOAR platform.">
          <form onSubmit={handleSiemSubmit(onSiemSubmit)}>
            <Controller control={siemControl} name="name" render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. Splunk Production" />
              </FormControl>
            )} />
            <Controller control={siemControl} name="platform" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Platform" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select platform">
                  {["Splunk", "Microsoft Sentinel", "IBM QRadar", "Elastic Security", "Google Chronicle"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={siemControl} name="exportType" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Export Type" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select export type">
                  {["Real-time Stream", "Batch (Hourly)", "Batch (Daily)", "On-demand"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isSiemSubmitting} isDisabled={isSiemSubmitting} className="mr-4">Add Connection</Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetSiem(); handlePopUpToggle("addConnection", false); }}>Cancel</Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Add Cloud Sync Modal */}
      <Modal
        isOpen={popUp.addSync.isOpen}
        onOpenChange={(isOpen) => { if (!isOpen) resetCloud(); handlePopUpToggle("addSync", isOpen); }}
      >
        <ModalContent title="Add Cloud Sync" subTitle="Sync certificates and keys from a cloud provider.">
          <form onSubmit={handleCloudSubmit(onCloudSubmit)}>
            <Controller control={cloudControl} name="provider" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Provider" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select provider">
                  {["AWS", "Azure", "GCP"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={cloudControl} name="name" render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. AWS ACM Sync" />
              </FormControl>
            )} />
            <Controller control={cloudControl} name="source" render={({ field, fieldState: { error } }) => (
              <FormControl label="Source" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. us-east-1, us-west-2" />
              </FormControl>
            )} />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isCloudSubmitting} isDisabled={isCloudSubmitting} className="mr-4">Add Sync</Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetCloud(); handlePopUpToggle("addSync", false); }}>Cancel</Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Add Scanner Modal */}
      <Modal
        isOpen={popUp.addScanner.isOpen}
        onOpenChange={(isOpen) => { if (!isOpen) resetScanner(); handlePopUpToggle("addScanner", isOpen); }}
      >
        <ModalContent title="Add Scanner" subTitle="Import results from a third-party scanning tool.">
          <form onSubmit={handleScannerSubmit(onScannerSubmit)}>
            <Controller control={scannerControl} name="name" render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. Qualys TLS Scan" />
              </FormControl>
            )} />
            <Controller control={scannerControl} name="platform" defaultValue="" render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Platform" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select platform">
                  {["Qualys", "Shodan", "Nessus", "Censys", "CertSpotter"].map((v) => (
                    <SelectItem value={v} key={v}>{v}</SelectItem>
                  ))}
                </Select>
              </FormControl>
            )} />
            <Controller control={scannerControl} name="source" render={({ field, fieldState: { error } }) => (
              <FormControl label="Source" isRequired isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g. External Perimeter Scan" />
              </FormControl>
            )} />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isScannerSubmitting} isDisabled={isScannerSubmitting} className="mr-4">Add Scanner</Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetScanner(); handlePopUpToggle("addScanner", false); }}>Cancel</Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteActionModal
        isOpen={popUp.deleteIntegration.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteIntegration", isOpen)}
        deleteKey={(popUp.deleteIntegration.data as { name: string })?.name || ""}
        title={`Delete "${(popUp.deleteIntegration.data as { name: string })?.name}"?`}
        onDeleteApproved={async () => {
          createNotification({ text: "Integration deleted.", type: "success" });
          handlePopUpClose("deleteIntegration");
        }}
      />
    </div>
  );
};
