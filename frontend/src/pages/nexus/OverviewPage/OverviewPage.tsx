import { Controller, useForm } from "react-hook-form";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, PageHeader, Select, SelectItem } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreatePolicyModal } from "../components";

const riskTrendData = [
  { date: "Nov 17", score: 4.2 },
  { date: "Nov 18", score: 5.1 },
  { date: "Nov 19", score: 5.8 },
  { date: "Nov 20", score: 6.9 },
  { date: "Nov 21", score: 7.5 }
];

const sparklineData = [
  { v: 3.8 },
  { v: 4.2 },
  { v: 4.9 },
  { v: 5.5 },
  { v: 6.1 },
  { v: 6.8 },
  { v: 7.5 }
];

const scannedDonutData = [
  { name: "Compliant", value: 2150, fill: "#68d391" },
  { name: "Non-compliant", value: 1515, fill: "#fc8181" }
];

const classicalViolations = [
  { name: "Expired Certificate", count: 359, color: "#fc8181" },
  { name: "Certificate Validity Period Check", count: 61, color: "#ecc94b" },
  { name: "Small RSA Key Length", count: 59, color: "#ecc94b" },
  { name: "TLS 1.2 Cipher Suite", count: 49, color: "#ecc94b" }
];

const topPolicies = [
  { name: "Non Quantum-Safe Algorithm", count: 1066 },
  { name: "PQC Unsafe Protocols (SSL2, SSL3, TLSv1.0-1.2)", count: 840 },
  { name: "Ensure Keys Based on Quantum-Safe Algorithms", count: 779 },
  { name: "Non-PQC Asymmetric Algorithms in Use", count: 474 },
  { name: "AES Keys Less Than 256 Bits", count: 74 }
];

const InfisicalTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-xs shadow-md">
      <p className="text-mineshaft-400">{label || payload[0].name}</p>
      <p className="font-medium text-mineshaft-100">{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

const scanFormSchema = z.object({
  scanJob: z.string().min(1, "Scan job is required"),
  scope: z.string().default("Full Scan")
});
type TScanFormSchema = z.infer<typeof scanFormSchema>;

export const OverviewPage = () => {
  const { t } = useTranslation();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createPolicy",
    "runDiscoveryScan"
  ] as const);

  const {
    handleSubmit: handleScanSubmit,
    control: scanControl,
    reset: resetScan,
    formState: { isSubmitting: isScanSubmitting }
  } = useForm<TScanFormSchema>({
    resolver: zodResolver(scanFormSchema),
    defaultValues: { scope: "Full Scan" }
  });

  const onScanSubmit = () => {
    createNotification({ text: "Discovery scan initiated successfully.", type: "success" });
    resetScan();
    handlePopUpToggle("runDiscoveryScan", false);
  };

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Nexus Overview" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Nexus Overview"
          description="Monitor your organization's post-quantum cryptographic security posture."
        />

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {/* Enterprise Risk Score */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
              Enterprise Risk Score
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-mineshaft-100">7.5</span>
              <span className="text-lg text-mineshaft-400">/10</span>
            </div>
            <p className="mt-1 text-[11px] text-mineshaft-400">
              Based on avg. CVSS score across all IT assets
            </p>
            <p className="mt-2 text-[10px] text-red-400">High</p>
            <div className="mt-2 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#fc8181"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PQC Readiness */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
              PQC Readiness
            </p>
            <span className="text-3xl font-semibold text-mineshaft-100">11.17%</span>
            <div className="mt-3 flex justify-center">
              <svg width="100" height="60" viewBox="0 0 100 60">
                <path
                  d="M 10 55 A 40 40 0 0 1 90 55"
                  fill="none"
                  stroke="#3e4249"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 55 A 40 40 0 0 1 19 30"
                  fill="none"
                  stroke="#fc8181"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="mt-2 text-center text-[10px] text-red-400">Low</p>
          </div>

          {/* Total Violations */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
              Total Violations
            </p>
            <span className="text-3xl font-semibold text-mineshaft-100">1,700</span>
            <div className="mt-4 flex flex-col gap-2">
              {[
                { label: "Certificates", value: "1,371", dot: "bg-red-400" },
                { label: "Keys", value: "213", dot: "bg-yellow-400" },
                { label: "Protocols", value: "116", dot: "bg-blue-400" }
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
                    <span className="text-mineshaft-400">{item.label}</span>
                  </div>
                  <span className="text-mineshaft-300">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scanned Objects */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
              Scanned Objects
            </p>
            <span className="text-3xl font-semibold text-mineshaft-100">3,665</span>
            <div className="mt-3 flex items-center justify-center">
              <div className="relative h-[80px] w-[80px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={scannedDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={38}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      {scannedDonutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-2 flex justify-center gap-4 text-[10px]">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="text-mineshaft-400">Compliant: 2,150</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span className="text-mineshaft-400">Non-compliant: 1,515</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 */}
        <div className="mb-6 grid grid-cols-[1fr_0.85fr_0.65fr] gap-4">
          {/* Top Violated PQC Policies */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-mineshaft-100">Top Violated PQC Policies</h2>
              <span className="cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-300">
                View all
              </span>
            </div>
            <div className="flex flex-col">
              {topPolicies.map((policy, i) => (
                <div
                  key={policy.name}
                  className="flex items-center justify-between border-b border-mineshaft-600 py-3 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-mineshaft-400">{i + 1}.</span>
                    <span className="text-[13px] text-mineshaft-300">{policy.name}</span>
                  </div>
                  <span className="text-sm text-mineshaft-400">
                    {policy.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Violations by Category */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <h2 className="mb-4 text-sm font-medium text-mineshaft-100">Violations by Category</h2>
            <div className="mb-5 grid grid-cols-3 gap-4">
              {[
                { label: "Certificates", total: "1,371", classical: "485", pqc: "886" },
                { label: "Keys", total: "213", classical: "59", pqc: "154" },
                { label: "Protocols", total: "116", classical: "49", pqc: "67" }
              ].map((col) => (
                <div key={col.label}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
                    {col.label}
                  </p>
                  <p className="text-lg font-semibold text-mineshaft-100">{col.total}</p>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-mineshaft-400">Classical:</span>
                      <span className="text-mineshaft-400">{col.classical}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mineshaft-400">PQC:</span>
                      <span className="text-mineshaft-400">{col.pqc}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
                Ticket Status Overview
              </p>
              <div className="flex items-center gap-4">
                <div className="relative h-[60px] w-[60px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Open", value: 2, fill: "#fc8181" },
                          { name: "In Progress", value: 1, fill: "#ecc94b" },
                          { name: "Closed", value: 1, fill: "#68d391" }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={18}
                        outerRadius={28}
                        dataKey="value"
                        strokeWidth={0}
                      />
                      <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-mineshaft-100">
                    4
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[11px]">
                  <span className="text-mineshaft-400">
                    Open: <span className="text-mineshaft-300">2</span>
                  </span>
                  <span className="text-mineshaft-400">
                    In Progress: <span className="text-mineshaft-300">1</span>
                  </span>
                  <span className="text-mineshaft-400">
                    Closed: <span className="text-mineshaft-300">1</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Trend + Quick Actions */}
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
            <h2 className="mb-4 text-sm font-medium text-mineshaft-100">
              Risk Score (Last 7 Days)
            </h2>
            <div className="h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskTrendData}>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5c6170", fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 10]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5c6170", fontSize: 10 }}
                    width={20}
                  />
                  <Tooltip content={<InfisicalTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#fc8181"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-5 border-t border-mineshaft-600 pt-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-mineshaft-400">
                Quick Actions
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handlePopUpOpen("createPolicy")}
                  className="w-full rounded-md border border-mineshaft-600 bg-transparent px-4 py-2 text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-100"
                >
                  + Create Policy
                </button>
                <button
                  type="button"
                  onClick={() => handlePopUpOpen("runDiscoveryScan")}
                  className="w-full rounded-md border border-mineshaft-600 bg-transparent px-4 py-2 text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-100"
                >
                  Run Discovery Scan
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3 - Classical Violations */}
        <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-mineshaft-100">
              Top Classical Policy Violations
            </h2>
            <select className="rounded-md border border-mineshaft-500 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-300 outline-none">
              <option>All</option>
              <option>Certificates</option>
              <option>Keys</option>
              <option>Protocols</option>
            </select>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classicalViolations} layout="vertical" barSize={18}>
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#5c6170", fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={220}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#a1a5ab", fontSize: 11 }}
                />
                <Tooltip content={<InfisicalTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {classicalViolations.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <CreatePolicyModal
        isOpen={popUp.createPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
      />

      <Modal
        isOpen={popUp.runDiscoveryScan.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetScan();
          handlePopUpToggle("runDiscoveryScan", isOpen);
        }}
      >
        <ModalContent title="Run Discovery Scan" subTitle="Initiate an on-demand scan of your infrastructure.">
          <form onSubmit={handleScanSubmit(onScanSubmit)}>
            <Controller
              control={scanControl}
              name="scanJob"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Scan Job" isRequired isError={Boolean(error)} errorText={error?.message}>
                  <Select {...field} onValueChange={onChange} className="w-full" placeholder="Select a job">
                    {["prod-network-scan", "k8s-cluster-prod", "infisical-pki", "infisical-kms", "ct-log-monitor"].map((v) => (
                      <SelectItem value={v} key={v}>{v}</SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={scanControl}
              name="scope"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Scope" isError={Boolean(error)} errorText={error?.message}>
                  <Select {...field} onValueChange={onChange} className="w-full">
                    {["Full Scan", "Quick Scan", "Incremental"].map((v) => (
                      <SelectItem value={v} key={v}>{v}</SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <div className="mt-7 flex items-center">
              <Button type="submit" isLoading={isScanSubmitting} isDisabled={isScanSubmitting} className="mr-4">
                Start Scan
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => { resetScan(); handlePopUpToggle("runDiscoveryScan", false); }}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};
