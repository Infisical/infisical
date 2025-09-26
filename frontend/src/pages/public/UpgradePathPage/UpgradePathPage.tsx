/* eslint-disable no-nested-ternary */
import React, { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { SingleValue } from "react-select";
import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl } from "@app/components/v2";

import {
  useCalculateUpgradePath,
  useGetUpgradePathVersions
} from "../../../hooks/api/upgradePath/queries";

type VersionOption = {
  label: string;
  value: string;
  isLatest: boolean;
};

const formatVersionOption = (option: VersionOption) => (
  <div className="flex items-center justify-between">
    <span>{option.label}</span>
    {option.isLatest && <span className="text-xs text-primary">(Latest)</span>}
  </div>
);
interface UpgradeResult {
  path: Array<{
    version: string;
    name: string;
    publishedAt: string;
    prerelease: boolean;
  }>;
  breakingChanges: Array<{
    version: string;
    changes: Array<{
      title: string;
      description: string;
      action: string;
    }>;
  }>;
  features: Array<{
    version: string;
    name: string;
    body: string;
    publishedAt: string;
  }>;
  hasDbMigration: boolean;
  config: Record<string, unknown>;
}

export const UpgradePathPage = () => {
  const [fromVersion, setFromVersion] = useState<string | null>(null);
  const [toVersion, setToVersion] = useState<string | null>(null);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResult | null>(null);

  const {
    data: versions,
    isLoading: versionsLoading,
    isFetching: versionsFetching
  } = useGetUpgradePathVersions({
    enabled: true,
    staleTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const calculateMutation = useCalculateUpgradePath();

  // Handle mutation results
  React.useEffect(() => {
    if (calculateMutation.isSuccess && calculateMutation.data) {
      setUpgradeResult(calculateMutation.data);
    }
  }, [calculateMutation.isSuccess, calculateMutation.data]);

  React.useEffect(() => {
    if (calculateMutation.isError) {
      createNotification({
        text:
          (calculateMutation.error as any)?.response?.data?.message ||
          "Failed to calculate upgrade path",
        type: "error"
      });
    }
  }, [calculateMutation.isError, calculateMutation.error]);

  const versionOptions = useMemo(() => {
    if (!versions?.versions) return [];

    return versions.versions
      .filter((version) => !version.tagName.includes("nightly"))
      .map((version) => ({
        label: version.tagName,
        value: version.tagName,
        isLatest: versions.versions[0]?.tagName === version.tagName
      }));
  }, [versions?.versions]);

  const handleFromVersionSelect = (value: unknown) => {
    const selected = value as SingleValue<VersionOption>;
    setFromVersion(selected?.value || null);
  };

  const handleToVersionSelect = (value: unknown) => {
    const selected = value as SingleValue<VersionOption>;
    setToVersion(selected?.value || null);
  };

  const handleCalculate = () => {
    if (!fromVersion || !toVersion) {
      createNotification({
        text: "Please select both from and to versions",
        type: "error"
      });
      return;
    }

    if (fromVersion === toVersion) {
      createNotification({
        text: "From and To versions cannot be the same",
        type: "error"
      });
      return;
    }

    calculateMutation.mutate({
      fromVersion,
      toVersion
    });
  };

  return (
    <>
      <Helmet>
        <title>Infisical Upgrade Path Tool | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Infisical Upgrade Path Tool" />
        <meta
          name="og:description"
          content="Plan your Infisical upgrade path safely and efficiently."
        />
      </Helmet>
      <div className="dark h-full">
        <div className="flex h-screen flex-col justify-between overflow-auto bg-mineshaft-900 text-bunker-200 dark:[color-scheme:dark]">
          <div />
          <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-0">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center pt-8">
                <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                  <img
                    src="/images/gradientLogo.svg"
                    height={90}
                    width={120}
                    alt="Infisical logo"
                    className="cursor-pointer"
                  />
                </a>
              </div>
              <h1 className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-4xl font-medium text-transparent">
                Upgrade your Infisical Version
              </h1>
            </div>

            {/* Calculator Card */}
            <div className="mb-8 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6">
              <h2 className="mb-6 text-xl font-semibold text-bunker-200">Calculate Upgrade Path</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* From Version Selector */}
                  <FormControl label="From Version" isRequired>
                    <FilterableSelect
                      options={versionOptions}
                      value={versionOptions.find((opt) => opt.value === fromVersion) || null}
                      onChange={handleFromVersionSelect}
                      placeholder="Search or select version..."
                      isLoading={versionsLoading || versionsFetching}
                      isDisabled={versionsLoading || versionsFetching}
                      isSearchable
                      isClearable
                      menuPortalTarget={document.body}
                      formatOptionLabel={formatVersionOption}
                    />
                  </FormControl>

                  {/* To Version Selector */}
                  <FormControl label="To Version" isRequired>
                    <FilterableSelect
                      options={versionOptions}
                      value={versionOptions.find((opt) => opt.value === toVersion) || null}
                      onChange={handleToVersionSelect}
                      placeholder="Search or select version..."
                      isLoading={versionsLoading || versionsFetching}
                      isDisabled={versionsLoading || versionsFetching}
                      isSearchable
                      isClearable
                      menuPortalTarget={document.body}
                      formatOptionLabel={formatVersionOption}
                    />
                  </FormControl>
                </div>

                <Button
                  onClick={handleCalculate}
                  isLoading={calculateMutation.isPending}
                  className="w-full bg-primary font-medium text-black hover:bg-primary/80"
                >
                  {calculateMutation.isPending ? "Calculating..." : "Calculate Upgrade Path"}
                </Button>
              </div>
            </div>

            {/* Results Section */}
            {upgradeResult && (
              <div className="space-y-6">
                {/* Action Required Banner */}
                {(() => {
                  const versionsWithBreakingChanges = upgradeResult.breakingChanges
                    .filter((bc) => bc.changes.length > 0)
                    .map((bc) => bc.version);

                  const versionsWithDbMigrations = upgradeResult.path
                    .filter((step, index) => {
                      const isStartingVersion = index === 0;
                      if (isStartingVersion) return false;

                      const versionConfig = upgradeResult.config as Record<string, any>;

                      const possibleKeys = [
                        step.version,
                        step.version.replace(/^v/, ""),
                        step.version.replace(/^infisical\/v?/, ""),
                        step.version.replace(/^infisical\/v?/, "").replace(/-[a-zA-Z]+$/, "")
                      ];

                      const dbSchemaChanges = possibleKeys
                        .map((key) => versionConfig?.[key]?.db_schema_changes)
                        .find((changes) => changes);

                      return (
                        dbSchemaChanges &&
                        (typeof dbSchemaChanges === "string"
                          ? dbSchemaChanges.trim()
                          : dbSchemaChanges)
                      );
                    })
                    .map((step) => step.version);

                  const allConflictVersions = [
                    ...new Set([...versionsWithBreakingChanges, ...versionsWithDbMigrations])
                  ];
                  const hasIssues = allConflictVersions.length > 0;

                  return (
                    <div
                      className={`rounded-lg border p-4 ${
                        hasIssues
                          ? "border-yellow-500/20 bg-yellow-500/10"
                          : "border-green-500/20 bg-green-500/10"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {hasIssues ? (
                            <svg
                              className="h-5 w-5 text-yellow-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-5 w-5 text-green-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3
                            className={`font-medium ${
                              hasIssues ? "text-yellow-400" : "text-green-400"
                            }`}
                          >
                            {hasIssues ? "Action Required:" : "Ready to Upgrade:"}
                          </h3>
                          <p className="mt-1 text-sm text-bunker-300">
                            {hasIssues
                              ? `Your upgrade path contains conflicts in the following versions: ${allConflictVersions.join(", ")}. Please review and resolve each item before proceeding to the next version.`
                              : "Your upgrade path is clear with no breaking changes or conflicts. You can proceed with the upgrade."}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Upgrade Steps */}
                <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6">
                  <div className="mb-6 flex items-center space-x-2">
                    <svg
                      className="h-5 w-5 text-bunker-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                    <h2 className="text-xl font-semibold text-bunker-200">Upgrade Steps</h2>
                  </div>

                  <div className="space-y-6">
                    {(() => {
                      const pathSteps = upgradeResult.path.map((step) => ({
                        ...step,
                        hasGithubRelease: true
                      }));

                      const breakingChangeSteps = upgradeResult.breakingChanges
                        .filter(
                          (bc) =>
                            !upgradeResult.path.some((step) => {
                              const normalizeVersion = (v: string) =>
                                v.replace(/^(infisical\/)?v?/, "").replace(/-[a-zA-Z]+$/, "");
                              return (
                                normalizeVersion(step.version) === normalizeVersion(bc.version)
                              );
                            })
                        )
                        .map((bc) => ({
                          version: bc.version,
                          name: bc.version,
                          publishedAt: new Date().toISOString(),
                          prerelease: false,
                          hasGithubRelease: false
                        }));

                      const allSteps = [...pathSteps, ...breakingChangeSteps];

                      allSteps.sort((a, b) => {
                        const normalizeForSort = (v: string) => {
                          const cleaned = v
                            .replace(/^(infisical\/)?v?/, "")
                            .replace(/-[a-zA-Z]+$/, "");
                          const parts = cleaned.split(".").map(Number);
                          return parts[0] * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
                        };
                        return normalizeForSort(a.version) - normalizeForSort(b.version);
                      });

                      return allSteps;
                    })().map((step, index, allSteps) => {
                      const isFirst = index === 0;
                      const isLast = index === allSteps.length - 1;

                      const versionChanges = upgradeResult.breakingChanges.find((bc) => {
                        if (bc.version === step.version) return true;

                        const normalizeVersion = (v: string) => {
                          return v.replace(/^(infisical\/)?v?/, "").replace(/-[a-zA-Z]+$/, "");
                        };

                        const normalizedStep = normalizeVersion(step.version);
                        const normalizedBC = normalizeVersion(bc.version);

                        return normalizedStep === normalizedBC;
                      });

                      const versionConfig = upgradeResult.config as Record<string, any>;

                      const possibleKeys = [
                        step.version,
                        step.version.replace(/^v/, ""),
                        step.version.replace(/^infisical\/v?/, ""),
                        step.version.replace(/^infisical\/v?/, "").replace(/-[a-zA-Z]+$/, "")
                      ];

                      const dbMigrationDescription = possibleKeys
                        .map((key) => versionConfig?.[key]?.db_schema_changes)
                        .find((changes) => changes);

                      const hasDbMigration =
                        !isFirst &&
                        dbMigrationDescription &&
                        (typeof dbMigrationDescription === "string"
                          ? dbMigrationDescription.trim()
                          : dbMigrationDescription);

                      const hasBreakingChanges =
                        versionChanges && versionChanges.changes.length > 0;

                      return (
                        <div key={step.version} className="relative flex">
                          {/* Timeline Column */}
                          <div className="mr-4 flex flex-col items-center">
                            <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-black">
                              <span className="text-xs font-bold">{index + 1}</span>
                            </div>

                            {/* Timeline Line */}
                            {!isLast && (
                              <div className="-mb-4 -mt-4 h-full w-px flex-1 bg-mineshaft-500" />
                            )}
                          </div>

                          {/* Content Column */}
                          <div className="flex-1 pb-6">
                            {/* Version Header */}
                            <div className="flex items-center space-x-3">
                              <h3 className="font-medium text-bunker-200">{step.version}</h3>
                              {isFirst && (
                                <span className="rounded border border-primary/30 bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                                  Starting Version
                                </span>
                              )}
                              {isLast && (
                                <span className="rounded border border-primary/30 bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                                  Target Version
                                </span>
                              )}
                              {step.hasGithubRelease ? (
                                <a
                                  href={`https://github.com/Infisical/infisical/releases/tag/${step.version}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1 text-xs text-primary transition-colors hover:text-primary/80"
                                >
                                  <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
                                  <span>View Changelog</span>
                                </a>
                              ) : (
                                <span className="inline-flex items-center space-x-1 text-xs text-bunker-400">
                                  <span>No GitHub Release</span>
                                </span>
                              )}
                            </div>

                            {/* Version Notes */}
                            {(() => {
                              if (isFirst) return null;

                              const notes = possibleKeys
                                .map((key) => versionConfig?.[key]?.notes)
                                .find((note) => note);

                              if (!notes) return null;

                              return (
                                <div className="mt-3 rounded border border-bunker-500/20 bg-bunker-700/20 p-3">
                                  <div className="text-sm text-bunker-300">{notes}</div>
                                </div>
                              );
                            })()}

                            {/* Database Schema Changes */}
                            {hasDbMigration && (
                              <div className="mt-3 rounded border border-yellow-500/20 bg-yellow-500/10 p-3">
                                <div className="mb-1 text-sm font-medium text-yellow-400">
                                  Database Schema Changes Required
                                </div>
                                <div className="mb-2 text-xs text-bunker-300">
                                  {typeof dbMigrationDescription === "string"
                                    ? dbMigrationDescription
                                    : "This version includes database schema changes that require migrations."}
                                </div>
                                <div className="text-xs font-medium text-yellow-400">
                                  Action:{" "}
                                  <span className="font-normal italic">
                                    Make sure to backup your database before proceeding
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Breaking Changes */}
                            {hasBreakingChanges && (
                              <div className="mt-3 space-y-3">
                                <div className="flex items-center space-x-2">
                                  <svg
                                    className="h-4 w-4 text-red-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <span className="text-sm font-medium text-red-400">
                                    Breaking Changes ({versionChanges.changes.length})
                                  </span>
                                </div>
                                {versionChanges.changes.map((change) => (
                                  <div
                                    key={`${step.version}-${change.title}`}
                                    className="rounded border border-red-500/20 bg-red-500/10 p-3"
                                  >
                                    <div className="mb-1 text-sm font-medium text-red-400">
                                      {change.title}
                                    </div>
                                    <div className="mb-2 text-xs text-bunker-300">
                                      {change.description}
                                    </div>
                                    <div className="text-xs font-medium text-red-400">
                                      Action:{" "}
                                      <span className="font-normal italic">{change.action}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="w-full bg-mineshaft-800 p-2">
            <p className="text-center text-sm text-bunker-400">
              Made with ❤️ by{" "}
              <a className="text-primary hover:text-primary/80" href="https://infisical.com">
                Infisical
              </a>
              <br />
              235 2nd st, San Francisco, California, 94105, United States. 🇺🇸
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
