import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faColumns, faLock, faMagnifyingGlass, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { PageHeader } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreatePolicyModal } from "../components";

const complianceDonut = [
  { name: "Compliant", value: 2150, fill: "#68d391" },
  { name: "Non-compliant", value: 1515, fill: "#fc8181" }
];

const violationsDistribution = [
  { name: "Certificates", value: 1371, bgClass: "bg-red-400" },
  { name: "Keys", value: 213, bgClass: "bg-yellow-400" },
  { name: "Protocols", value: 116, bgClass: "bg-blue-400" }
];

const violationsTotal = violationsDistribution.reduce((sum, d) => sum + d.value, 0);

const topViolatedPolicies = [
  { name: "Organization Default PQC Baseline", count: 1245 },
  { name: "Disallow DSA Keys", count: 178 },
  { name: "Certificate Validity Period Check", count: 61 },
  { name: "Small RSA Key Length", count: 59 },
  { name: "TLS 1.2 Cipher Suite Compliance", count: 49 }
];

const policies = [
  { name: "Organization Default PQC Baseline", category: "All", subCategory: "PQC", mode: "Enforcing", type: "User-defined", state: true, compliance: "NIST", controlId: "SC-12 SC-13", violated: "1,245", updated: "Feb 20, 2026" },
  { name: "Minimum AES Key Size 128 bits", category: "Symmetric Keys", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "-", updated: "Nov 21, 2025" },
  { name: "Weak Post-Quantum Security Posture", category: "Certificates", subCategory: "PQC", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "SC-12 SC-13 RA-5 PM-30", violated: "-", updated: "Nov 21, 2025" },
  { name: "AES Keys < 256 Bits are PQC Unsafe", category: "Symmetric Keys", subCategory: "PQC", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "74", updated: "Nov 21, 2025" },
  { name: "Ensure Keys Based on Quantum-Safe Algorithms", category: "Asymmetric Keys", subCategory: "PQC", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "779", updated: "Nov 21, 2025" },
  { name: "PQC Unsafe Protocols (SSL2-TLSv1.2)", category: "Protocols", subCategory: "PQC", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "840", updated: "Nov 21, 2025" },
  { name: "Disallow DSA Keys", category: "Asymmetric Keys", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "178", updated: "Nov 21, 2025" },
  { name: "Certificate Validity Period Check", category: "Certificates", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "SC-12", violated: "61", updated: "Nov 21, 2025" },
  { name: "Small RSA Key Length", category: "Asymmetric Keys", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "59", updated: "Nov 21, 2025" },
  { name: "TLS 1.2 Cipher Suite Compliance", category: "Protocols", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: false, compliance: "NIST", controlId: "SC-13", violated: "49", updated: "Nov 21, 2025" },
  { name: "Weak Signature Algorithm", category: "Certificates", subCategory: "Classical", mode: "Monitoring", type: "System-defined", state: true, compliance: "NIST", controlId: "-", violated: "6", updated: "Nov 21, 2025" }
];

const InfisicalTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-xs shadow-md">
      <p className="text-mineshaft-400">{payload[0].name}</p>
      <p className="font-medium text-mineshaft-100">{payload[0].value.toLocaleString()}</p>
    </div>
  );
};

export const PoliciesPage = () => {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [complianceFilter, setComplianceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["createPolicy"] as const);

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter && p.category !== "All") return false;
      if (subCategoryFilter && p.subCategory !== subCategoryFilter) return false;
      if (stateFilter === "Activated" && !p.state) return false;
      if (stateFilter === "Deactivated" && p.state) return false;
      if (complianceFilter && p.compliance !== complianceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [categoryFilter, subCategoryFilter, stateFilter, complianceFilter, searchQuery]);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Policies & Compliance" })}</title>
      </Helmet>
      <div className="mx-auto max-w-8xl px-6 pb-6">
        <PageHeader
          scope={ProjectType.Nexus}
          title="Policies & Compliance"
          description="Apply NIST policies and organizational mandates to evaluate risk, classify vulnerabilities, and ensure standards compliance."
        />

        {/* Top Summary Row */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {/* Card 1 - Compliance Status */}
          <div className="flex flex-col rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-mineshaft-400">
                Compliance Status
              </p>
              <select className="rounded border border-mineshaft-600 bg-mineshaft-900 px-2 py-1 text-[10px] text-mineshaft-400 outline-none">
                <option>All</option>
                <option>Certificates</option>
                <option>Keys</option>
                <option>Protocols</option>
              </select>
            </div>
            <div className="flex flex-1 items-center gap-6">
              <div className="relative h-[130px] w-[130px] shrink-0 overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={complianceDonut}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {complianceDonut.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<InfisicalTooltip />} wrapperStyle={{ zIndex: 50 }} />
                  </PieChart>
                </ResponsiveContainer>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-semibold text-mineshaft-100">
                  3,665
                </span>
              </div>
              <div className="flex flex-col gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="text-mineshaft-400">Compliant: 2,150</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-mineshaft-400">Non-compliant: 1,515</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 - Violations Distribution */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-mineshaft-400">
              Total Violations Distribution
            </p>
            <p className="mb-4 text-2xl font-semibold text-mineshaft-100">{violationsTotal.toLocaleString()}</p>
            <div className="mb-3 flex h-4 w-full overflow-visible">
              {violationsDistribution.map((item, index) => (
                <div
                  key={item.name}
                  className={`group/bar relative ${item.bgClass} ${index === 0 ? "rounded-l-full" : ""} ${index === violationsDistribution.length - 1 ? "rounded-r-full" : ""}`}
                  style={{ width: `${(item.value / violationsTotal) * 100}%` }}
                >
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-xs shadow-md opacity-0 transition-opacity group-hover/bar:opacity-100">
                    <p className="text-mineshaft-400">{item.name}</p>
                    <p className="font-medium text-mineshaft-100">{item.value.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[10px]">
              {violationsDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${item.bgClass}`} />
                  <span className="text-mineshaft-400">{item.name}: {item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3 - Top Violated Policies */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-mineshaft-400">
              Top Violated Policies
            </p>
            <div className="flex flex-col">
              {topViolatedPolicies.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="truncate text-mineshaft-100">{p.name}</span>
                  <span className="ml-2 shrink-0 text-mineshaft-400">
                    {p.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Policies Table */}
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
              >
                <option value="">Category</option>
                <option value="Symmetric Keys">Symmetric Keys</option>
                <option value="Asymmetric Keys">Asymmetric Keys</option>
                <option value="Certificates">Certificates</option>
                <option value="Protocols">Protocols</option>
              </select>
              <select
                value={subCategoryFilter}
                onChange={(e) => setSubCategoryFilter(e.target.value)}
                className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
              >
                <option value="">Sub-Category</option>
                <option value="PQC">PQC</option>
                <option value="Classical">Classical</option>
              </select>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
              >
                <option value="">Policy State</option>
                <option value="Activated">Activated</option>
                <option value="Deactivated">Deactivated</option>
              </select>
              <select
                value={complianceFilter}
                onChange={(e) => setComplianceFilter(e.target.value)}
                className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-1.5 text-xs text-mineshaft-400 outline-none"
              >
                <option value="">Compliance</option>
                <option value="NIST">NIST</option>
                <option value="PCI DSS">PCI DSS</option>
              </select>
              {(categoryFilter || subCategoryFilter || stateFilter || complianceFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("");
                    setSubCategoryFilter("");
                    setStateFilter("");
                    setComplianceFilter("");
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
                  placeholder="Search policies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 bg-transparent text-xs text-mineshaft-100 placeholder-mineshaft-500 outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-mineshaft-600 px-3 py-1.5 text-xs text-mineshaft-400 hover:bg-mineshaft-700"
              >
                <FontAwesomeIcon icon={faColumns} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePopUpOpen("createPolicy")}
                className="rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
              >
                + Create Policy
              </button>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-mineshaft-600 bg-mineshaft-900">
                <th className="w-8 px-4 py-3">
                  <input type="checkbox" className="rounded border-mineshaft-600" />
                </th>
                {["POLICY NAME", "CATEGORY", "SUB-CATEGORY", "MODE", "TYPE", "STATE", "COMPLIANCE", "CONTROL ID", "VIOLATED ASSETS", "LAST UPDATED"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-[0.05em] text-mineshaft-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FontAwesomeIcon
                        icon={faShieldHalved}
                        className="h-8 w-8 text-mineshaft-500"
                      />
                      <p className="text-sm font-medium text-mineshaft-100">No policies found</p>
                      <p className="text-xs text-mineshaft-400">
                        Create a policy to start monitoring your cryptographic assets.
                      </p>
                      <button
                        type="button"
                        onClick={() => handlePopUpOpen("createPolicy")}
                        className="mt-1 rounded-md border border-mineshaft-500 bg-transparent px-4 py-2 text-xs font-medium text-mineshaft-100 hover:bg-mineshaft-700"
                      >
                        + Create Policy
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPolicies.map((policy, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-b border-mineshaft-600 transition-colors hover:bg-mineshaft-700"
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded border-mineshaft-600" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <FontAwesomeIcon
                          icon={faLock}
                          className="h-3 w-3 text-mineshaft-400"
                        />
                        <span className="text-xs text-mineshaft-100">{policy.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-mineshaft-400">{policy.category}</td>
                    <td className="px-3 py-3 text-xs text-mineshaft-400">{policy.subCategory}</td>
                    <td className="px-3 py-3 text-xs text-mineshaft-400">{policy.mode}</td>
                    <td className="px-3 py-3 text-xs text-mineshaft-400">{policy.type}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-[11px] ${policy.state ? "text-green-400" : "text-mineshaft-400"}`}
                      >
                        {policy.state ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-mineshaft-600 px-1.5 py-0.5 text-[10px] text-mineshaft-400">
                        {policy.compliance}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {policy.controlId !== "-" ? (
                        <div className="flex flex-wrap gap-1">
                          {policy.controlId.split(" ").map((id) => (
                            <span
                              key={id}
                              className="rounded bg-mineshaft-600 px-1.5 py-0.5 text-[10px] text-mineshaft-400"
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-mineshaft-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {policy.violated !== "-" ? (
                        <span className="text-xs text-mineshaft-400">{policy.violated}</span>
                      ) : (
                        <span className="text-xs text-mineshaft-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-mineshaft-400">{policy.updated}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreatePolicyModal
        isOpen={popUp.createPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
      />
    </div>
  );
};
