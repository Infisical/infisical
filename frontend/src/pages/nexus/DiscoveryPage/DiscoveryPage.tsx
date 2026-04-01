import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faDownload, faEllipsis, faExternalLink, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
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

const subNavItems = ["Jobs", "Installations", "Scan History"] as const;
type SubNav = (typeof subNavItems)[number];

const discoveryJobs = [
  { name: "prod-network-scan", type: "Network Scan", target: "172.16.0.0/24", ports: "443, 8443", status: "Completed", lastScan: "Feb 24, 2026", assets: 1247 },
  { name: "k8s-cluster-prod", type: "Kubernetes Scan", target: "prod-cluster", ports: "-", status: "Completed", lastScan: "Feb 23, 2026", assets: 384 },
  { name: "infisical-pki", type: "Infisical PKI", target: "PKI Demo, Marsh McLennan", ports: "-", status: "Synced", lastScan: "Live", assets: 1301 },
  { name: "infisical-kms", type: "Infisical KMS", target: "KMS_TEST", ports: "-", status: "Synced", lastScan: "Live", assets: 779 },
  { name: "ct-log-monitor", type: "CT Log Monitoring", target: "All CAs", ports: "-", status: "Running", lastScan: "In Progress (First Run)", assets: 0 }
];

const installations = [
  { name: "agent-prod-01", host: "prod-worker-1.acmecorp.com", version: "1.2.0", heartbeat: "2 min ago", status: "Online" },
  { name: "agent-staging-01", host: "staging-app.acmecorp.com", version: "1.1.8", heartbeat: "5 min ago", status: "Online" },
  { name: "agent-dev-01", host: "dev-server.acmecorp.com", version: "1.0.5", heartbeat: "3 days ago", status: "Offline" }
];

const scanHistory = [
  { scanId: "scan-9281", job: "prod-network-scan", type: "Network", started: "Feb 24, 2026 11:00 PM", completed: "Feb 24, 2026 11:04 PM", duration: "4m 32s", assets: 1247, status: "Completed" },
  { scanId: "scan-9280", job: "k8s-cluster-prod", type: "Kubernetes", started: "Feb 23, 2026 03:00 AM", completed: "Feb 23, 2026 03:02 AM", duration: "2m 15s", assets: 384, status: "Completed" },
  { scanId: "scan-9279", job: "prod-network-scan", type: "Network", started: "Feb 17, 2026 11:00 PM", completed: "Feb 17, 2026 11:05 PM", duration: "5m 01s", assets: 1198, status: "Completed" },
  { scanId: "scan-9278", job: "prod-network-scan", type: "Network", started: "Feb 10, 2026 11:00 PM", completed: "-", duration: "-", assets: 0, status: "Failed" }
];

function JobStatusBadge({ status }: { status: string }) {
  const cls =
    status === "Completed" || status === "Synced"
      ? "text-green-400"
      : status === "Failed"
        ? "text-red-400"
        : "text-mineshaft-400";
  return <span className={`text-[11px] ${cls}`}>{status}</span>;
}

const thClass =
  "px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-mineshaft-400";

const addJobSchema = z.object({
  jobName: z.string().trim().min(1, "Job name is required").regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  scanType: z.string().min(1, "Scan type is required"),
  target: z.string().trim().min(1, "Target is required"),
  ports: z.string().optional()
});
type TAddJobSchema = z.infer<typeof addJobSchema>;

const generateTokenSchema = z.object({
  tokenName: z.string().trim().min(1, "Token name is required"),
  expiresIn: z.string().default("90 days")
});
type TGenerateTokenSchema = z.infer<typeof generateTokenSchema>;

export const DiscoveryPage = () => {
  const { t } = useTranslation();
  const [activeSubNav, setActiveSubNav] = useState<SubNav>("Jobs");
  const [searchQuery, setSearchQuery] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addJob",
    "generateToken",
    "deleteJob"
  ] as const);

  const {
    handleSubmit: handleJobSubmit,
    control: jobControl,
    reset: resetJob,
    formState: { isSubmitting: isJobSubmitting }
  } = useForm<TAddJobSchema>({
    resolver: zodResolver(addJobSchema)
  });

  const {
    handleSubmit: handleTokenSubmit,
    control: tokenControl,
    reset: resetToken,
    formState: { isSubmitting: isTokenSubmitting }
  } = useForm<TGenerateTokenSchema>({
    resolver: zodResolver(generateTokenSchema),
    defaultValues: { expiresIn: "90 days" }
  });

  const onJobSubmit = () => {
    createNotification({ text: "Discovery job created successfully.", type: "success" });
    resetJob();
    handlePopUpToggle("addJob", false);
  };

  const onTokenSubmit = () => {
    createNotification({ text: "Agent token generated successfully.", type: "success" });
    resetToken();
    handlePopUpToggle("generateToken", false);
  };

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return discoveryJobs;
    const q = searchQuery.toLowerCase();
    return discoveryJobs.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q) ||
        j.target.toLowerCase().includes(q) ||
        j.ports.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredInstallations = useMemo(() => {
    if (!searchQuery) return installations;
    const q = searchQuery.toLowerCase();
    return installations.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.host.toLowerCase().includes(q) ||
        a.version.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredScanHistory = useMemo(() => {
    if (!searchQuery) return scanHistory;
    const q = searchQuery.toLowerCase();
    return scanHistory.filter(
      (s) =>
        s.scanId.toLowerCase().includes(q) ||
        s.job.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Discovery" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Discovery"
          description="Configure scan profiles to discover cryptographic keys, certificates, and protocols across your hybrid environment."
        />

        <div className="flex gap-6">
          {/* Left sub-nav */}
          <div className="w-[160px] shrink-0">
            <nav className="flex flex-col gap-0.5">
              {subNavItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setActiveSubNav(item); setSearchQuery(""); }}
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

          {/* Main content area */}
          <div className="flex-1">
            {activeSubNav === "Jobs" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-1 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">Discovery Jobs</h2>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xs text-mineshaft-400">
                        Configure and manage scans to discover certificates across your
                        infrastructure.
                      </p>
                      <a
                        href="#"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                      >
                        Documentation{" "}
                        <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePopUpOpen("addJob")}
                    className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                  >
                    + Add Job
                  </button>
                </div>

                <div className="my-4 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5">
                  <FontAwesomeIcon
                    icon={faMagnifyingGlass}
                    className="mr-2 h-3.5 w-3.5 text-mineshaft-400"
                  />
                  <input
                    type="text"
                    placeholder="Search by name, domain, or IP..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs text-mineshaft-100 placeholder-mineshaft-500 outline-none"
                  />
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["NAME", "SCAN TYPE", "TARGET", "PORTS", "STATUS", "LAST SCAN", "ASSETS FOUND", ""].map(
                        (h) => (
                          <th key={h} className={thClass}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {job.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{job.type}</td>
                        <td className="px-4 py-3 font-mono text-xs text-mineshaft-400">
                          {job.target}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{job.ports}</td>
                        <td className="px-4 py-3">
                          <JobStatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{job.lastScan}</td>
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {job.assets > 0 ? job.assets.toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-3">
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
                              <DropdownMenuItem onClick={() => createNotification({ text: "Edit functionality coming soon.", type: "info" })}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePopUpOpen("deleteJob", { name: job.name })}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "Installations" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-mineshaft-100">
                      Agent Installations
                    </h2>
                    <p className="mt-1 text-xs text-mineshaft-400">
                      Deploy the Nexus agent to local environments for filesystem scanning.
                    </p>
                  </div>
                </div>

                {/* Download links */}
                <div className="mb-5 grid grid-cols-3 gap-3">
                  {["Linux (amd64)", "macOS (arm64)", "Windows (x64)"].map((os) => (
                    <button
                      key={os}
                      type="button"
                      onClick={() => createNotification({ text: `Downloading Nexus agent for ${os}...`, type: "info" })}
                      className="flex items-center gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-900 px-4 py-3 text-xs text-mineshaft-100 transition-colors hover:bg-mineshaft-700"
                    >
                      <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-mineshaft-400" />
                      {os}
                    </button>
                  ))}
                </div>

                {/* Token generation */}
                <div className="mb-5 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-mineshaft-100">
                        Agent Authentication Token
                      </p>
                      <p className="mt-1 text-[11px] text-mineshaft-400">
                        Generate a token for your agent to authenticate with Nexus.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePopUpOpen("generateToken")}
                      className="rounded-md border border-mineshaft-500 bg-transparent px-3 py-1.5 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                    >
                      Generate Token
                    </button>
                  </div>
                </div>

                {/* Agent status table */}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["AGENT NAME", "HOST", "VERSION", "LAST HEARTBEAT", "STATUS"].map((h) => (
                        <th key={h} className={thClass}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInstallations.map((agent, i) => (
                      <tr
                        key={i}
                        className="border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {agent.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-mineshaft-400">
                          {agent.host}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{agent.version}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">
                          {agent.heartbeat}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[11px] ${agent.status === "Online" ? "text-green-400" : "text-mineshaft-400"}`}
                          >
                            {agent.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubNav === "Scan History" && (
              <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
                <h2 className="mb-4 text-sm font-semibold text-mineshaft-100">Scan History</h2>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-mineshaft-600">
                      {["SCAN ID", "JOB NAME", "TYPE", "STARTED", "COMPLETED", "DURATION", "ASSETS FOUND", "STATUS"].map(
                        (h) => (
                          <th key={h} className={thClass}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScanHistory.map((scan, i) => (
                      <tr
                        key={i}
                        className="cursor-pointer border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-mineshaft-100">
                          {scan.scanId}
                        </td>
                        <td className="px-4 py-3 text-xs text-mineshaft-100">{scan.job}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{scan.type}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{scan.started}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{scan.completed}</td>
                        <td className="px-4 py-3 text-xs text-mineshaft-400">{scan.duration}</td>
                        <td className="px-4 py-3 text-xs font-medium text-mineshaft-100">
                          {scan.assets > 0 ? scan.assets.toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <JobStatusBadge status={scan.status} />
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

      {/* Add Job Modal */}
      <Modal
        isOpen={popUp.addJob.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetJob();
          handlePopUpToggle("addJob", isOpen);
        }}
      >
        <ModalContent title="Add Discovery Job" subTitle="Configure a new scan to discover cryptographic assets.">
          <form onSubmit={handleJobSubmit(onJobSubmit)}>
            <Controller
              control={jobControl}
              name="jobName"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Job Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="e.g. prod-network-scan" />
                </FormControl>
              )}
            />
            <Controller
              control={jobControl}
              name="scanType"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Scan Type" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select scan type">
                    {["Network Scan", "Kubernetes Scan", "Infisical PKI", "Infisical KMS", "CT Log"].map((v) => (
                      <SelectItem value={v} key={v}>{v}</SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={jobControl}
              name="target"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Target" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="e.g. 172.16.0.0/24 or cluster-name" />
                </FormControl>
              )}
            />
            <Controller
              control={jobControl}
              name="ports"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Ports" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="e.g. 443, 8443 (optional)" />
                </FormControl>
              )}
            />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isJobSubmitting} isDisabled={isJobSubmitting} className="mr-4">
                Add Job
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetJob(); handlePopUpToggle("addJob", false); }}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Generate Token Modal */}
      <Modal
        isOpen={popUp.generateToken.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetToken();
          handlePopUpToggle("generateToken", isOpen);
        }}
      >
        <ModalContent title="Generate Agent Token" subTitle="Create a new authentication token for Nexus agents.">
          <form onSubmit={handleTokenSubmit(onTokenSubmit)}>
            <Controller
              control={tokenControl}
              name="tokenName"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Token Name" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="e.g. agent-prod-token" />
                </FormControl>
              )}
            />
            <Controller
              control={tokenControl}
              name="expiresIn"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Expires In" isError={Boolean(error)} errorText={error?.message}>
                  <Select {...field} onValueChange={onChange} className="w-full">
                    {["30 days", "90 days", "1 year", "Never"].map((v) => (
                      <SelectItem value={v} key={v}>{v}</SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isTokenSubmitting} isDisabled={isTokenSubmitting} className="mr-4">
                Generate
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetToken(); handlePopUpToggle("generateToken", false); }}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Delete Job Confirmation */}
      <DeleteActionModal
        isOpen={popUp.deleteJob.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteJob", isOpen)}
        deleteKey={(popUp.deleteJob.data as { name: string })?.name || ""}
        title={`Delete job "${(popUp.deleteJob.data as { name: string })?.name}"?`}
        onDeleteApproved={async () => {
          createNotification({ text: "Discovery job deleted.", type: "success" });
          handlePopUpClose("deleteJob");
        }}
      />
    </div>
  );
};
