import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

const InfisicalTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-xs shadow-md">
      <p className="text-mineshaft-400">{payload[0].name}</p>
      <p className="font-medium text-mineshaft-100">{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

const certStatusDonut = [
  { name: "Expired", value: 365, fill: "#fc8181" },
  { name: "Revoked", value: 242, fill: "#ecc94b" },
  { name: "Not-yet-valid", value: 195, fill: "#5c6170" },
  { name: "Valid", value: 499, fill: "#68d391" }
];

const caDonut = [
  { name: "Internal CA", value: 520, fill: "#63b3ed" },
  { name: "Let's Encrypt", value: 380, fill: "#68d391" },
  { name: "DigiCert", value: 245, fill: "#90cdf4" },
  { name: "Sectigo", value: 98, fill: "#ecc94b" },
  { name: "Other", value: 58, fill: "#5c6170" }
];

const sigAlgoDonut = [
  { name: "RSA-2048", value: 472, fill: "#fc8181" },
  { name: "ECDSA-256", value: 238, fill: "#ecc94b" },
  { name: "RSA-4096", value: 87, fill: "#ecc94b" },
  { name: "Ed25519", value: 68, fill: "#68d391" },
  { name: "Other", value: 436, fill: "#5c6170" }
];

const policyViolations = [
  { name: "Certificate Validity Period Check", count: 61 },
  { name: "Small RSA Key Length", count: 59 },
  { name: "Weak Signature Algorithm", count: 6 }
];

const expiringRanges = [
  { range: "< 10 days", count: 4 },
  { range: "11-20 days", count: 12 },
  { range: "21-30 days", count: 10 },
  { range: "31-40 days", count: 28 },
  { range: "41-50 days", count: 35 }
];

function DonutChart({
  data,
  centerLabel,
  size = "sm"
}: {
  data: { name: string; value: number; fill: string }[];
  centerLabel: string;
  size?: "sm" | "lg";
}) {
  return (
    <div
      className={`relative shrink-0 ${size === "lg" ? "h-[160px] w-[160px]" : "h-[120px] w-[120px]"}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size === "lg" ? 48 : 35}
            outerRadius={size === "lg" ? 72 : 55}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
        </PieChart>
      </ResponsiveContainer>
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center font-semibold text-mineshaft-100 ${size === "lg" ? "text-lg" : "text-sm"}`}
      >
        {centerLabel}
      </span>
    </div>
  );
}

export const CertificatesPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Certificates"
          description="Monitor certificate health, expiry, PQC readiness, and policy compliance across your estate."
        />

        {/* Top Strip - Certificate PQC Readiness */}
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6">
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center">
              <svg width="160" height="95" viewBox="0 0 160 95">
                <path
                  d="M 15 85 A 65 65 0 0 1 145 85"
                  fill="none"
                  stroke="#3e4249"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M 15 85 A 65 65 0 0 1 38 35"
                  fill="none"
                  stroke="#fc8181"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <text
                  x="80"
                  y="70"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="22"
                  fontWeight="600"
                >
                  15.2%
                </text>
                <text x="80" y="88" textAnchor="middle" fill="#7c8189" fontSize="10">
                  PQC-Safe
                </text>
              </svg>
              <p className="mt-2 text-[10px] text-mineshaft-400">
                % of certificates using PQC-safe algorithms
              </p>
            </div>

            <div className="grid flex-1 grid-cols-3 gap-4">
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-green-400">182</p>
                <p className="mt-1 text-xs text-mineshaft-400">Safe</p>
              </div>
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-red-400">1,063</p>
                <p className="mt-1 text-xs text-mineshaft-400">Unsafe</p>
              </div>
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-mineshaft-400">56</p>
                <p className="mt-1 text-xs text-mineshaft-400">Not Evaluated</p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1 - Two columns */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-mineshaft-100">Total Certificates</h2>
              <span className="cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-100">
                View all (1,301)
              </span>
            </div>
            <p className="mb-4 text-2xl font-semibold text-mineshaft-100">1,301</p>
            <div className="flex items-center gap-6">
              <DonutChart data={certStatusDonut} centerLabel="1,301" size="lg" />
              <div className="flex flex-col gap-3 text-xs">
                {certStatusDonut.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-mineshaft-400">
                      {item.name}: <span className="text-mineshaft-400">{item.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-mineshaft-100">
                Policy Violations on Certificates
              </h2>
              <span className="cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-100">
                View all (126)
              </span>
            </div>
            <p className="mb-4 text-2xl font-semibold text-mineshaft-100">126</p>
            <div className="flex flex-col">
              {policyViolations.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-mineshaft-600 py-3 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-mineshaft-400">{i + 1}.</span>
                    <span className="text-[13px] text-mineshaft-100">{v.name}</span>
                  </div>
                  <span className="text-sm text-mineshaft-400">{v.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2 - Three columns */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <h2 className="mb-4 text-sm font-semibold text-mineshaft-100">
              Certificate Authorities
            </h2>
            <div className="flex flex-col items-center gap-4">
              <DonutChart data={caDonut} centerLabel="1,301" />
              <div className="flex w-full flex-col gap-1.5 text-[11px]">
                {caDonut.map((ca, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ca.fill }} />
                      <span className="text-mineshaft-400">{ca.name}</span>
                    </div>
                    <span className="text-mineshaft-400">{ca.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <h2 className="mb-1 text-sm font-semibold text-mineshaft-100">Expiring Certificates</h2>
            <p className="mb-4 text-2xl font-semibold text-mineshaft-100">499</p>
            <div className="flex flex-col gap-1.5">
              {expiringRanges.map((range, i) => {
                const maxCount = Math.max(...expiringRanges.map((r) => r.count));
                const percentage = (range.count / maxCount) * 100;

                return (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-md px-3 py-1.5 transition-colors hover:bg-mineshaft-700"
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-primary-800/20 transition-all group-hover:bg-primary-800/30"
                      style={{ width: `${percentage}%` }}
                    />
                    <div className="relative flex items-center justify-between">
                      <span className="text-xs text-mineshaft-300">{range.range}</span>
                      <span className="text-xs font-medium text-mineshaft-200 tabular-nums">
                        {range.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <h2 className="mb-4 text-sm font-semibold text-mineshaft-100">
              Signature Algorithm Distribution
            </h2>
            <div className="flex flex-col items-center gap-4">
              <DonutChart data={sigAlgoDonut} centerLabel="1,301" />
              <div className="flex w-full flex-col gap-1.5 text-[11px]">
                {sigAlgoDonut.map((algo, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: algo.fill }}
                      />
                      <span className="text-mineshaft-400">{algo.name}</span>
                    </div>
                    <span className="text-mineshaft-400">{algo.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
