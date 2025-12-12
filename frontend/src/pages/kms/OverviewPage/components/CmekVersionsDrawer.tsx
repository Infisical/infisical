import { useEffect, useState } from "react";
import { faHistory, faKey, faTimes, faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, Spinner, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { formatKmsDate, TCmek, useGetCmekVersions, useRollbackCmek } from "@app/hooks/api/cmeks";

type Props = {
  cmek: TCmek | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CmekVersionsDrawer = ({ isOpen, onOpenChange, cmek }: Props) => {
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);

  const { data, isLoading } = useGetCmekVersions(cmek?.id ?? "", {
    enabled: isOpen && Boolean(cmek?.id)
  });

  const rollbackMutation = useRollbackCmek();

  const handleRollback = async (targetVersion: number) => {
    if (!cmek) return;

    setRollingBackVersion(targetVersion);
    try {
      await rollbackMutation.mutateAsync({
        keyId: cmek.id,
        projectId: cmek.projectId,
        targetVersion
      });
      createNotification({
        text: `Key rolled back to version ${targetVersion}`,
        type: "success"
      });
    } catch {
      // Error handled by global handler
    } finally {
      setRollingBackVersion(null);
    }
  };

  // Handle Escape key at document level for better accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onOpenChange]);

  if (!isOpen || !cmek) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bunker-900/60"
        onClick={() => onOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onOpenChange(false);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Close drawer"
      />

      {/* Drawer */}
      <div className="animate-slide-in-right relative w-full max-w-md bg-bunker-800 shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-mineshaft-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faHistory} className="text-mineshaft-400" />
              <div>
                <h3 className="text-lg font-medium text-mineshaft-100">Key Versions</h3>
                <p className="text-sm text-mineshaft-400">{cmek.name}</p>
              </div>
            </div>
            <Button
              variant="plain"
              colorSchema="secondary"
              size="xs"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faTimes} />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : data?.versions && data.versions.length > 0 ? (
              <div className="space-y-3">
                <p className="mb-4 text-sm text-mineshaft-400">
                  Current version:{" "}
                  <span className="font-mono font-bold text-mineshaft-100">
                    {data.currentVersion}
                  </span>
                </p>

                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute top-0 bottom-0 left-4 w-px bg-mineshaft-600" />

                  {/* Version items */}
                  <div className="space-y-4">
                    {data.versions.map((version, index) => {
                      const isCurrent = version.version === data.currentVersion;
                      return (
                        <div key={version.id} className="relative flex items-start gap-4 pl-10">
                          {/* Timeline dot */}
                          <div
                            className={`absolute top-1.5 left-2.5 h-3 w-3 rounded-full border-2 ${
                              isCurrent
                                ? "border-primary-500 bg-primary-500"
                                : "border-mineshaft-500 bg-bunker-800"
                            }`}
                          />

                          {/* Version card */}
                          <div
                            className={`flex-1 rounded-md border p-3 ${
                              isCurrent
                                ? "border-primary-500/30 bg-primary-500/10"
                                : "border-mineshaft-600 bg-bunker-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FontAwesomeIcon
                                  icon={faKey}
                                  className={isCurrent ? "text-primary-500" : "text-mineshaft-400"}
                                />
                                <span className="font-mono font-medium text-mineshaft-100">
                                  Version {version.version}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isCurrent ? (
                                  <Badge variant="success" className="text-xs">
                                    Current
                                  </Badge>
                                ) : (
                                  <Tooltip content={`Rollback to version ${version.version}`}>
                                    <Button
                                      variant="outline_bg"
                                      colorSchema="secondary"
                                      size="xs"
                                      isLoading={rollingBackVersion === version.version}
                                      isDisabled={rollbackMutation.isPending}
                                      onClick={() => handleRollback(version.version)}
                                      leftIcon={<FontAwesomeIcon icon={faUndo} />}
                                    >
                                      Rollback
                                    </Button>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-mineshaft-400">
                              Created: {formatKmsDate(version.createdAt)}
                            </p>
                            {index === 0 && data.versions.length > 1 && (
                              <p className="mt-1 text-xs text-mineshaft-500">Latest</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FontAwesomeIcon icon={faHistory} className="mb-3 text-3xl text-mineshaft-500" />
                <p className="text-mineshaft-400">No version history available</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-mineshaft-600 px-6 py-4">
            <p className="text-xs text-mineshaft-500">
              Previous key versions are retained to decrypt data encrypted with older versions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
