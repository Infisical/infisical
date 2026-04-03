import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

const InfisicalTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-xs shadow-md">
      <p className="text-mineshaft-400">{label || payload[0].name}</p>
      <p className="font-medium text-mineshaft-100">{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

const protocolData = [
  { name: "TLSv1.3+1.2", count: 420, color: "#ecc94b" },
  { name: "TLSv1.2", count: 310, color: "#fc8181" },
  { name: "TLSv1.3", count: 180, color: "#68d391" },
  { name: "TLSv1.0", count: 45, color: "#fc8181" },
  { name: "SSL3", count: 12, color: "#fc8181" },
  { name: "Other", count: 54, color: "#5c6170" }
];

const itAssets = [
  { label: "Application", shortLabel: "App", count: 314, color: "#ecc94b", size: 60 },
  { label: "Database", shortLabel: "Database", count: 364, color: "#68d391", size: 70 },
  { label: "Service", shortLabel: "Service", count: 1426, color: "#63b3ed", size: 100 }
];

const asymmetricKeys = [
  { name: "RSA 2048", count: 263, color: "#fc8181", pqcSafe: false },
  { name: "ECDSA P-256", count: 198, color: "#ecc94b", pqcSafe: false },
  { name: "RSA 4096", count: 145, color: "#ecc94b", pqcSafe: false },
  { name: "ML-KEM-768", count: 98, color: "#68d391", pqcSafe: true },
  { name: "Ed25519", count: 47, color: "#68d391", pqcSafe: false },
  { name: "Other", count: 28, color: "#5c6170", pqcSafe: false }
];

const symmetricKeys = [
  { name: "AES-128", count: 340, color: "#ecc94b" },
  { name: "AES-256", count: 285, color: "#68d391" },
  { name: "ChaCha20-256", count: 94, color: "#68d391" },
  { name: "3DES", count: 22, color: "#fc8181" },
  { name: "Other", count: 15, color: "#5c6170" }
];

const libraryDonut = [
  { name: "OpenSSL", value: 420, fill: "#63b3ed" },
  { name: "BouncyCastle", value: 280, fill: "#90cdf4" },
  { name: "JCA", value: 195, fill: "#ecc94b" },
  { name: "Go crypto", value: 140, fill: "#68d391" },
  { name: "Other", value: 86, fill: "#5c6170" }
];

const langDonut = [
  { name: "Java", value: 380, fill: "#fc8181" },
  { name: "Python", value: 290, fill: "#63b3ed" },
  { name: "Go", value: 210, fill: "#68d391" },
  { name: "C/C++", value: 160, fill: "#ecc94b" },
  { name: "C#", value: 55, fill: "#90cdf4" },
  { name: "Dart", value: 26, fill: "#5c6170" }
];

export const PqcReadinessPage = () => {
  const { t } = useTranslation();
  const [itAssetTypeFilter, setItAssetTypeFilter] = useState("");
  const [asymmetricAlgoFilter, setAsymmetricAlgoFilter] = useState("");
  const [symmetricAlgoFilter, setSymmetricAlgoFilter] = useState("");

  const filteredItAssets = useMemo(() => {
    if (!itAssetTypeFilter) return itAssets;
    return itAssets.filter((a) => a.label === itAssetTypeFilter);
  }, [itAssetTypeFilter]);

  const filteredAsymmetricKeys = useMemo(() => {
    if (!asymmetricAlgoFilter) return asymmetricKeys;
    return asymmetricKeys.filter((k) => k.name.startsWith(asymmetricAlgoFilter));
  }, [asymmetricAlgoFilter]);

  const asymmetricTotal = useMemo(
    () => filteredAsymmetricKeys.reduce((sum, k) => sum + k.count, 0),
    [filteredAsymmetricKeys]
  );

  const filteredSymmetricKeys = useMemo(() => {
    if (!symmetricAlgoFilter) return symmetricKeys;
    return symmetricKeys.filter((k) => k.name.startsWith(symmetricAlgoFilter));
  }, [symmetricAlgoFilter]);

  const symmetricTotal = useMemo(
    () => filteredSymmetricKeys.reduce((sum, k) => sum + k.count, 0),
    [filteredSymmetricKeys]
  );

  function AsymmetricKeyTick({ x, y, payload }: any) {
    const entry = filteredAsymmetricKeys.find((k) => k.name === payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={-4} y={0} dy={4} textAnchor="end" fill="#e2e8f0" fontSize={10}>
          {payload.value}
        </text>
        {entry?.pqcSafe && (
          <g transform="translate(-145, -6)">
            <rect width="46" height="14" rx="3" fill="#68d391" fillOpacity={0.15} />
            <text x="23" y="10" textAnchor="middle" fill="#68d391" fontSize={8} fontWeight="600">
              PQC-Safe
            </text>
          </g>
        )}
      </g>
    );
  }

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "PQC Readiness" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="PQC Readiness"
          description="Assess your organization's readiness for post-quantum cryptographic standards."
        />

        {/* Top Strip - Readiness Summary */}
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6">
          <div className="flex items-center gap-8">
            {/* Arc Gauge */}
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
                  19.05%
                </text>
                <text x="80" y="88" textAnchor="middle" fill="#7c8189" fontSize="10">
                  PQC Readiness
                </text>
              </svg>
              <div className="mt-2 flex gap-4 text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-mineshaft-400">{"Low (<40%)"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="text-mineshaft-400">Moderate (41-80%)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-mineshaft-400">{"Good (>80%)"}</span>
                </div>
              </div>
              <span className="mt-2 text-[10px] text-red-400">Low</span>
            </div>

            {/* Stat Grid */}
            <div className="grid flex-1 grid-cols-4 gap-4">
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-green-400">235</p>
                <p className="mt-1 text-xs text-mineshaft-400">Safe</p>
              </div>
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-red-400">848</p>
                <p className="mt-1 text-xs text-mineshaft-400">Unsafe</p>
              </div>
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-mineshaft-400">12</p>
                <p className="mt-1 text-xs text-mineshaft-400">Not Evaluated</p>
              </div>
              <div className="group relative rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-center">
                <p className="text-2xl font-semibold text-mineshaft-400">138</p>
                <p className="mt-1 text-xs text-mineshaft-400">Not Applicable</p>
                <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-[10px] leading-relaxed text-mineshaft-400 shadow-lg group-hover:block">
                  Assets that do not use cryptography (e.g. static content, non-TLS endpoints).
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-mineshaft-400">
            Based on % of IT assets protected with PQC-safe encryption
          </p>
        </div>

        {/* IT Assets & Protocol Usage - Side by Side */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* IT Assets Section */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-mineshaft-100">IT Assets</h2>
              <div className="flex items-center gap-2">
                <select
                  value={itAssetTypeFilter}
                  onChange={(e) => setItAssetTypeFilter(e.target.value)}
                  className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none focus:border-blue-400"
                >
                  <option value="">All Types</option>
                  <option value="Application">Application</option>
                  <option value="Database">Database</option>
                  <option value="Service">Service</option>
                </select>
                {itAssetTypeFilter && (
                  <button
                    type="button"
                    onClick={() => setItAssetTypeFilter("")}
                    className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-8">
              {/* Bubble Visualization */}
              <div className="relative flex h-[140px] w-[220px] items-center justify-center">
                <div className="flex items-end gap-4">
                  {[...filteredItAssets]
                    .sort((a, b) => b.count - a.count)
                    .map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-center rounded-full border bg-mineshaft-800 text-center"
                        style={{ borderColor: item.color, width: item.size, height: item.size }}
                      >
                        <div>
                          <p
                            className={`font-semibold text-mineshaft-100 ${item.size >= 100 ? "text-lg" : "text-sm"}`}
                          >
                            {item.count.toLocaleString()}
                          </p>
                          <p
                            className={`text-mineshaft-400 ${item.size >= 100 ? "text-[10px]" : "text-[9px]"}`}
                          >
                            {item.shortLabel}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Stat Breakdown */}
              <div className="flex-1">
                <div className="flex flex-col gap-3">
                  {filteredItAssets.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between border-b border-mineshaft-600 pb-3 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-mineshaft-100">{item.label}</span>
                      </div>
                      <span className="text-sm text-mineshaft-400">
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Protocol Distribution */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-mineshaft-100">
                Protocol Usage Across IT Assets
              </h2>
              <span className="cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-100">
                View all &rarr;
              </span>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={protocolData} barSize={28}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7c8189", fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7c8189", fontSize: 10 }}
                    width={40}
                  />
                  <Tooltip
                    content={<InfisicalTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {protocolData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[10px]">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-mineshaft-400">Safe (TLSv1.3)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                <span className="text-mineshaft-400">Mixed</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-mineshaft-400">Unsafe</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-mineshaft-400" />
                <span className="text-mineshaft-400">Other</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column Key Breakdown */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* Asymmetric Keys */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-mineshaft-100">Asymmetric Keys</h2>
                <p className="mt-1 text-2xl font-semibold text-mineshaft-100">
                  {asymmetricTotal.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={asymmetricAlgoFilter}
                  onChange={(e) => setAsymmetricAlgoFilter(e.target.value)}
                  className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none focus:border-blue-400"
                >
                  <option value="">All Algorithms</option>
                  <option value="RSA">RSA</option>
                  <option value="ECDSA">ECDSA</option>
                  <option value="ML-KEM">ML-KEM</option>
                </select>
                {asymmetricAlgoFilter && (
                  <button
                    type="button"
                    onClick={() => setAsymmetricAlgoFilter("")}
                    className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredAsymmetricKeys} layout="vertical" barSize={16}>
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7c8189", fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    axisLine={false}
                    tickLine={false}
                    tick={<AsymmetricKeyTick />}
                  />
                  <Tooltip
                    content={<InfisicalTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {filteredAsymmetricKeys.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <span className="mt-2 inline-block cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-100">
              View all &rarr;
            </span>
          </div>

          {/* Symmetric Keys */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-mineshaft-100">Symmetric Keys</h2>
                <p className="mt-1 text-2xl font-semibold text-mineshaft-100">
                  {symmetricTotal.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={symmetricAlgoFilter}
                  onChange={(e) => setSymmetricAlgoFilter(e.target.value)}
                  className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none focus:border-blue-400"
                >
                  <option value="">All Algorithms</option>
                  <option value="AES">AES</option>
                  <option value="ChaCha20">ChaCha20</option>
                </select>
                {symmetricAlgoFilter && (
                  <button
                    type="button"
                    onClick={() => setSymmetricAlgoFilter("")}
                    className="rounded-md px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredSymmetricKeys} layout="vertical" barSize={16}>
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#7c8189", fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#e2e8f0", fontSize: 10 }}
                  />
                  <Tooltip
                    content={<InfisicalTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {filteredSymmetricKeys.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <span className="mt-2 inline-block cursor-pointer text-xs text-mineshaft-400 hover:text-mineshaft-100">
              View all &rarr;
            </span>
          </div>
        </div>

        {/* Cryptographic Library Usage */}
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
          <h2 className="mb-4 text-sm font-semibold text-mineshaft-100">Cryptographic Libraries</h2>
          <div className="grid grid-cols-2 gap-6">
            {/* By Library */}
            <div>
              <p className="mb-3 text-xs font-medium text-mineshaft-400">Library Distribution</p>
              <div className="flex items-center gap-6">
                <div className="relative h-[120px] w-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={libraryDonut}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {libraryDonut.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-mineshaft-100">
                    1,121
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px]">
                  {libraryDonut.map((lib, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lib.fill }}
                      />
                      <span className="text-mineshaft-400">
                        {lib.name}: {lib.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* By Language */}
            <div>
              <p className="mb-3 text-xs font-medium text-mineshaft-400">Usage by Language</p>
              <div className="flex items-center gap-6">
                <div className="relative h-[120px] w-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={langDonut}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {langDonut.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-mineshaft-100">
                    1,121
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px]">
                  {langDonut.map((lang, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lang.fill }}
                      />
                      <span className="text-mineshaft-400">
                        {lang.name}: {lang.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
