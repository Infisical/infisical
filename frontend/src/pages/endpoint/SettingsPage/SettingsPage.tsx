import { Helmet } from "react-helmet";
import { Settings2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useEndpointScanPolicy, useUpdateEndpointScanPolicy } from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ScanPolicyModal } from "./components/ScanPolicyModal";

export const SettingsPage = () => {
  const { data: policy, isPending } = useEndpointScanPolicy();
  const updatePolicy = useUpdateEndpointScanPolicy();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["policyModal"] as const);

  const hasRoots = Boolean(policy?.roots.length);

  const onToggleEnabled = (isEnabled: boolean) => {
    if (!policy) return;

    updatePolicy.mutate(
      {
        isEnabled,
        roots: policy.roots,
        excludePatterns: policy.excludePatterns,
        intervalHours: policy.intervalHours,
        ...(policy.maxFileMegabytes ? { maxFileMegabytes: policy.maxFileMegabytes } : {})
      },
      {
        onSuccess: () =>
          createNotification({
            type: "success",
            text: `Secret scanning ${isEnabled ? "enabled" : "disabled"}`
          })
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Endpoint Settings</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Settings"
          description="How every device in this organization behaves."
        />

        <Card>
          <CardHeader>
            <CardTitle>Secret Scanning</CardTitle>
            <CardAction>
              <div className="flex items-center gap-3">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Endpoint}
                >
                  {(isAllowed) =>
                    hasRoots ? (
                      <Switch
                        variant="endpoint"
                        checked={policy?.isEnabled ?? false}
                        disabled={!isAllowed || updatePolicy.isPending}
                        onCheckedChange={onToggleEnabled}
                        aria-label="Toggle secret scanning"
                      />
                    ) : (
                      // Enabling with no folders would look configured while scanning nothing, so the
                      // switch says why it is unavailable rather than failing on click.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Switch
                              variant="endpoint"
                              checked={false}
                              disabled
                              aria-label="Toggle secret scanning"
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Choose at least one folder first.</TooltipContent>
                      </Tooltip>
                    )
                  }
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.Endpoint}
                >
                  {(isAllowed) => (
                    <Button
                      variant="endpoint"
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("policyModal")}
                    >
                      <Settings2 />
                      Configure
                    </Button>
                  )}
                </ProjectPermissionCan>
              </div>
            </CardAction>
          </CardHeader>

          <CardContent>
            {isPending && <Skeleton className="h-10 w-full rounded-md" />}

            {!isPending && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  Devices check the folders below for credentials stored in files, and report what
                  they find on the device&apos;s own page. Only the file path and the rule that matched
                  leave the device; the credential itself never does.
                </p>

                {!hasRoots ? (
                  <p className="text-sm text-muted">
                    No folders configured yet. Choose which folders every device checks.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted">Folders scanned</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {policy?.roots.map((root) => (
                          <Badge key={root} variant="neutral" className="font-mono">
                            {root}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      Scanned every {policy?.intervalHours} hours
                      {policy?.maxFileMegabytes
                        ? `, skipping files over ${policy.maxFileMegabytes} MB`
                        : ""}
                      {policy?.excludePatterns.length
                        ? `, with ${policy.excludePatterns.length} extra exclusion${
                            policy.excludePatterns.length === 1 ? "" : "s"
                          }`
                        : ""}
                      .
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ScanPolicyModal
        policy={policy}
        isOpen={popUp.policyModal.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("policyModal");
        }}
      />
    </>
  );
};
