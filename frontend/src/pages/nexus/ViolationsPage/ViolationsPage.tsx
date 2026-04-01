import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faCheckCircle, faDownload, faEllipsis, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  PageHeader,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreateTicketModal } from "../components";

const violations = [
  { severity: "Critical", policy: "Non Quantum-Safe Algorithm", category: "PQC", asset: "key-a1b2c3 (RSA-2048)", assetType: "Asymmetric Key", itAsset: "Secrets-Prod", detected: "Feb 24, 2026", status: "Open", assignedTo: "ashwin@infisical.com" },
  { severity: "Critical", policy: "PQC Unsafe Protocols (SSL2-TLSv1.2)", category: "PQC", asset: "192.168.1.50:443 (TLS 1.0)", assetType: "Protocol", itAsset: "Legacy App", detected: "Feb 24, 2026", status: "Open", assignedTo: "daniel@infisical.com" },
  { severity: "Critical", policy: "Expired Certificate", category: "Classical", asset: "api.acmecorp.com (RSA-2048)", assetType: "Certificate", itAsset: "API Gateway", detected: "Feb 23, 2026", status: "In Progress", assignedTo: "arsh@infisical.com" },
  { severity: "High", policy: "Ensure Keys Based on Quantum-Safe Algorithms", category: "PQC", asset: "key-j1k2l3 (ECDSA-256)", assetType: "Asymmetric Key", itAsset: "KMS_TEST", detected: "Feb 23, 2026", status: "Open", assignedTo: "ashwin@infisical.com" },
  { severity: "High", policy: "Small RSA Key Length", category: "Classical", asset: "db.internal.corp (RSA-2048)", assetType: "Certificate", itAsset: "Database Cluster", detected: "Feb 22, 2026", status: "Accepted Risk", assignedTo: "carlos@infisical.com" },
  { severity: "High", policy: "Disallow DSA Keys", category: "Classical", asset: "key-x9y8z7 (DSA-1024)", assetType: "Asymmetric Key", itAsset: "Secrets-Staging", detected: "Feb 22, 2026", status: "Open", assignedTo: "" },
  { severity: "Medium", policy: "Certificate Validity Period Check", category: "Classical", asset: "cdn.acmecorp.com (ECDSA-384)", assetType: "Certificate", itAsset: "CDN Edge", detected: "Feb 21, 2026", status: "Resolved", assignedTo: "daniel@infisical.com" },
  { severity: "Medium", policy: "AES Keys < 256 Bits are PQC Unsafe", category: "PQC", asset: "key-m4n5o6 (AES-128)", assetType: "Symmetric Key", itAsset: "Secrets-Prod", detected: "Feb 21, 2026", status: "Open", assignedTo: "" },
  { severity: "Medium", policy: "Weak Signature Algorithm", category: "Classical", asset: "vault.acmecorp.com (SHA-1)", assetType: "Certificate", itAsset: "Vault Server", detected: "Feb 20, 2026", status: "Open", assignedTo: "arsh@infisical.com" },
  { severity: "High", policy: "TLS 1.2 Cipher Suite Compliance", category: "Classical", asset: "10.0.5.33:443 (RC4-SHA)", assetType: "Protocol", itAsset: "Staging Server", detected: "Feb 20, 2026", status: "Open", assignedTo: "" }
];

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === "Critical"
      ? "bg-red-400 text-red-400"
      : severity === "High" || severity === "Medium"
        ? "bg-yellow-400 text-yellow-400"
        : "bg-mineshaft-400 text-mineshaft-400";
  const [dotCls, textCls] = cls.split(" ");
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotCls}`} />
      <span className={`text-xs ${textCls}`}>{severity}</span>
    </div>
  );
}

function ViolationStatusBadge({ status }: { status: string }) {
  const cls =
    status === "Open"
      ? "text-red-400"
      : status === "In Progress"
        ? "text-yellow-400"
        : status === "Accepted Risk"
          ? "text-mineshaft-400"
          : "text-green-400";
  return <span className={`text-[11px] ${cls}`}>{status}</span>;
}

function ViolationDrawer({
  violation,
  onClose,
  onCreateTicket,
  onAcceptRisk,
  onResolve
}: {
  violation: (typeof violations)[0];
  onClose: () => void;
  onCreateTicket: () => void;
  onAcceptRisk: () => void;
  onResolve: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-mineshaft-600 bg-mineshaft-800 shadow-2xl">
      <div className="flex items-center justify-between border-b border-mineshaft-600 px-5 py-4">
        <div className="flex items-center gap-2">
          <SeverityDot severity={violation.severity} />
          <h3 className="text-sm font-semibold text-mineshaft-100">{violation.policy}</h3>
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
            Asset Detail
          </h4>
          <div className="flex flex-col gap-2 text-xs">
            {(
              [
                ["Asset", violation.asset],
                ["Type", violation.assetType],
                ["IT Asset", violation.itAsset],
                ["Detected", violation.detected],
                ["Status", violation.status]
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-mineshaft-400">{label}</span>
                <span className="text-mineshaft-100">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Policy Description
          </h4>
          <p className="text-xs leading-relaxed text-mineshaft-400">
            This policy detects cryptographic assets that do not meet post-quantum security
            requirements. Assets using classical algorithms like RSA, DSA, or ECDSA are flagged as
            quantum-unsafe since they can be broken by sufficiently powerful quantum computers.
          </p>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Remediation Recommendation
          </h4>
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3">
            <p className="text-xs leading-relaxed text-mineshaft-100">
              This RSA-2048 key is not quantum-safe. Rotate using ML-KEM-768 (CRYSTALS-Kyber) which
              is NIST-standardized. Estimated effort: Medium.
            </p>
          </div>
        </div>

        <div className="mb-5 border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Source
          </h4>
          <span className="text-xs text-mineshaft-400">
            {violation.itAsset} (Infisical Project)
          </span>
        </div>

        <div className="border-t border-mineshaft-600 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mineshaft-400">
            Linked Tickets
          </h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-mineshaft-600 px-2 py-0.5 font-mono text-mineshaft-400">
              INFRA-2847
            </span>
            <span className="text-[11px] text-yellow-400">In Progress</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-mineshaft-600 px-5 py-3">
        <button
          type="button"
          onClick={onCreateTicket}
          className="flex-1 rounded-md border border-mineshaft-500 bg-transparent px-3 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
        >
          Create Ticket
        </button>
        <button
          type="button"
          onClick={onAcceptRisk}
          className="rounded-md border border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-100"
        >
          Accept Risk
        </button>
        <button
          type="button"
          onClick={onResolve}
          className="rounded-md border border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-100"
        >
          Resolve
        </button>
      </div>
    </div>
  );
}

const uniquePolicies = [...new Set(violations.map((v) => v.policy))];
const uniqueAssetTypes = [...new Set(violations.map((v) => v.assetType))];
const uniqueSeverities = [...new Set(violations.map((v) => v.severity))];
const uniqueStatuses = [...new Set(violations.map((v) => v.status))];

const acceptRiskSchema = z.object({
  justification: z.string().trim().min(10, "Justification must be at least 10 characters"),
  reviewDate: z.string().optional()
});
type TAcceptRiskSchema = z.infer<typeof acceptRiskSchema>;

const resolveSchema = z.object({
  resolutionType: z.string().min(1, "Resolution type is required"),
  resolutionNotes: z.string().optional()
});
type TResolveSchema = z.infer<typeof resolveSchema>;

export const ViolationsPage = () => {
  const { t } = useTranslation();
  const [selectedViolation, setSelectedViolation] = useState<(typeof violations)[0] | null>(null);
  const [policyFilter, setPolicyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createTicket",
    "acceptRisk",
    "resolveViolation"
  ] as const);

  const {
    handleSubmit: handleRiskSubmit,
    control: riskControl,
    reset: resetRisk,
    formState: { isSubmitting: isRiskSubmitting }
  } = useForm<TAcceptRiskSchema>({
    resolver: zodResolver(acceptRiskSchema)
  });

  const {
    handleSubmit: handleResolveSubmit,
    control: resolveControl,
    reset: resetResolve,
    formState: { isSubmitting: isResolveSubmitting }
  } = useForm<TResolveSchema>({
    resolver: zodResolver(resolveSchema)
  });

  const onRiskSubmit = () => {
    createNotification({ text: "Risk accepted for this violation.", type: "success" });
    resetRisk();
    handlePopUpToggle("acceptRisk", false);
  };

  const onResolveSubmit = () => {
    createNotification({ text: "Violation marked as resolved.", type: "success" });
    resetResolve();
    handlePopUpToggle("resolveViolation", false);
  };

  const filteredViolations = useMemo(() => {
    return violations.filter((v) => {
      if (policyFilter && v.policy !== policyFilter) return false;
      if (categoryFilter && v.category !== categoryFilter) return false;
      if (assetTypeFilter && v.assetType !== assetTypeFilter) return false;
      if (severityFilter && v.severity !== severityFilter) return false;
      if (statusFilter && v.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !v.asset.toLowerCase().includes(q) &&
          !v.policy.toLowerCase().includes(q) &&
          !v.itAsset.toLowerCase().includes(q) &&
          !v.assignedTo.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [policyFilter, categoryFilter, assetTypeFilter, severityFilter, statusFilter, searchQuery]);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Violations" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          className="mb-6"
          scope={ProjectType.Nexus}
          title="Violations"
          description="Review, triage, and remediate active cryptographic policy violations across your organization."
        />

        {/* Top summary bar */}
        <div className="mb-6 flex items-center gap-4">
          {[
            { label: "Total Active", value: "1,700", cls: "text-mineshaft-100" },
            { label: "Critical", value: "405", cls: "text-red-400" },
            { label: "High", value: "264", cls: "text-yellow-400" },
            { label: "Medium", value: "22", cls: "text-yellow-400" },
            { label: "Low", value: "0", cls: "text-mineshaft-400" }
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 px-5 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-mineshaft-400">
                {card.label}
              </p>
              <p className={`text-xl font-semibold ${card.cls}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={policyFilter}
              onChange={(e) => setPolicyFilter(e.target.value)}
              className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
            >
              <option value="">All Policies</option>
              {uniquePolicies.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
            >
              <option value="">Category</option>
              <option value="PQC">PQC</option>
              <option value="Classical">Classical</option>
            </select>
            <select
              value={assetTypeFilter}
              onChange={(e) => setAssetTypeFilter(e.target.value)}
              className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
            >
              <option value="">Asset Type</option>
              {uniqueAssetTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
            >
              <option value="">Severity</option>
              {uniqueSeverities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
            >
              <option value="">Status</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {(policyFilter || categoryFilter || assetTypeFilter || severityFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setPolicyFilter("");
                  setCategoryFilter("");
                  setAssetTypeFilter("");
                  setSeverityFilter("");
                  setStatusFilter("");
                }}
                className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
              >
                Clear filters
              </button>
            )}
            <div className="flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="mr-2 h-3.5 w-3.5 text-mineshaft-400"
              />
              <input
                type="text"
                placeholder="Search by asset, policy, or host..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 bg-transparent text-xs text-mineshaft-100 placeholder-mineshaft-500 outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => createNotification({ text: "CSV export started.", type: "success" })}
            className="flex items-center gap-1.5 rounded-md border border-mineshaft-600 px-3 py-1.5 text-xs text-mineshaft-400 hover:bg-mineshaft-700"
          >
            <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-mineshaft-600">
                {["SEVERITY", "POLICY NAME", "CATEGORY", "ASSET", "ASSET TYPE", "LINKED IT ASSET", "ASSIGNED TO", "DETECTED", "STATUS", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-mineshaft-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredViolations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FontAwesomeIcon
                        icon={faCheckCircle}
                        className="h-8 w-8 text-mineshaft-500"
                      />
                      <p className="text-sm font-medium text-mineshaft-100">No violations found</p>
                      <p className="text-xs text-mineshaft-400">
                        All clear! Your cryptographic assets are compliant with active policies.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredViolations.map((v, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                    onClick={() => setSelectedViolation(v)}
                  >
                    <td className="px-4 py-3">
                      <SeverityDot severity={v.severity} />
                    </td>
                    <td className="px-4 py-3 text-xs text-mineshaft-100">{v.policy}</td>
                    <td className="px-4 py-3 text-xs text-mineshaft-400">{v.category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-mineshaft-400">{v.asset}</td>
                    <td className="px-4 py-3 text-xs text-mineshaft-400">{v.assetType}</td>
                    <td className="px-4 py-3 text-xs text-mineshaft-400">{v.itAsset}</td>
                    <td className="px-4 py-3 text-xs text-mineshaft-400">
                      {v.assignedTo ? (
                        <span>{v.assignedTo.split("@")[0]}</span>
                      ) : (
                        <span className="text-mineshaft-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-mineshaft-400">{v.detected}</td>
                    <td className="px-4 py-3">
                      <ViolationStatusBadge status={v.status} />
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1 text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FontAwesomeIcon icon={faEllipsis} className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => setSelectedViolation(v)}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePopUpOpen("createTicket")}>
                            Create Ticket
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePopUpOpen("acceptRisk")}>
                            Accept Risk
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedViolation && (
          <ViolationDrawer
            violation={selectedViolation}
            onClose={() => setSelectedViolation(null)}
            onCreateTicket={() => {
              setSelectedViolation(null);
              handlePopUpOpen("createTicket");
            }}
            onAcceptRisk={() => {
              setSelectedViolation(null);
              handlePopUpOpen("acceptRisk");
            }}
            onResolve={() => {
              setSelectedViolation(null);
              handlePopUpOpen("resolveViolation");
            }}
          />
        )}
      </div>

      <CreateTicketModal
        isOpen={popUp.createTicket.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createTicket", isOpen)}
      />

      {/* Accept Risk Modal */}
      <Modal
        isOpen={popUp.acceptRisk.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetRisk();
          handlePopUpToggle("acceptRisk", isOpen);
        }}
      >
        <ModalContent title="Accept Risk" subTitle="Document the justification for accepting this violation risk.">
          <form onSubmit={handleRiskSubmit(onRiskSubmit)}>
            <Controller
              control={riskControl}
              name="justification"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Justification" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <TextArea {...field} placeholder="Explain why this risk is acceptable..." reSize="none" rows={4} />
                </FormControl>
              )}
            />
            <Controller
              control={riskControl}
              name="reviewDate"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Review Date" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="YYYY-MM-DD (optional)" />
                </FormControl>
              )}
            />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isRiskSubmitting} isDisabled={isRiskSubmitting} className="mr-4">
                Accept Risk
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetRisk(); handlePopUpToggle("acceptRisk", false); }}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Resolve Violation Modal */}
      <Modal
        isOpen={popUp.resolveViolation.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetResolve();
          handlePopUpToggle("resolveViolation", isOpen);
        }}
      >
        <ModalContent title="Resolve Violation" subTitle="Mark this violation as resolved.">
          <form onSubmit={handleResolveSubmit(onResolveSubmit)}>
            <Controller
              control={resolveControl}
              name="resolutionType"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Resolution Type" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select resolution type">
                    {["Remediated", "False Positive", "Mitigating Control"].map((v) => (
                      <SelectItem value={v} key={v}>{v}</SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={resolveControl}
              name="resolutionNotes"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Resolution Notes" isError={Boolean(error)} errorText={error?.message}>
                  <TextArea {...field} placeholder="Optional notes about the resolution..." reSize="none" rows={3} />
                </FormControl>
              )}
            />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isResolveSubmitting} isDisabled={isResolveSubmitting} className="mr-4">
                Resolve
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetResolve(); handlePopUpToggle("resolveViolation", false); }}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};
