import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Badge, Button, Skeleton, Switch, UnstableInput } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useGetCertificateCleanupConfig,
  useUpdateCertificateCleanupConfig
} from "@app/hooks/api/certificateCleanup";

const formSchema = z.object({
  isEnabled: z.boolean(),
  daysBeforeDeletion: z.coerce.number().int().min(1).max(30),
  includeRevokedCertificates: z.boolean(),
  skipCertsWithActiveSyncs: z.boolean()
});

type TFormData = z.infer<typeof formSchema>;

export const CertificateCleanupTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data: config, isLoading } = useGetCertificateCleanupConfig(projectId);
  const updateConfig = useUpdateCertificateCleanupConfig();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isEnabled: false,
      daysBeforeDeletion: 3,
      includeRevokedCertificates: false,
      skipCertsWithActiveSyncs: true
    }
  });

  useEffect(() => {
    if (config) {
      reset({
        isEnabled: config.isEnabled,
        daysBeforeDeletion: config.daysBeforeDeletion,
        includeRevokedCertificates: config.includeRevokedCertificates,
        skipCertsWithActiveSyncs: config.skipCertsWithActiveSyncs
      });
    }
  }, [config, reset]);

  const isEnabled = watch("isEnabled");

  const onSubmit = async (data: TFormData) => {
    try {
      await updateConfig.mutateAsync({
        projectId,
        ...data
      });
      createNotification({
        text: "Certificate cleanup configuration saved",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to save certificate cleanup configuration",
        type: "error"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-medium text-mineshaft-100">Certificate Cleanup</h2>
            <p className="mt-1 text-sm text-gray-400">
              Automatically remove expired certificates to keep your project organized
            </p>
          </div>
          <Controller
            control={control}
            name="isEnabled"
            render={({ field: { value, onChange } }) => (
              <Switch variant="project" checked={value} onCheckedChange={onChange} />
            )}
          />
        </div>

        {config?.lastRunAt && (
          <div className="mt-6 rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-3">
            <p className="mb-2 text-xs font-medium tracking-wide text-gray-400 uppercase">
              Last Execution
            </p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Status:</span>
                <Badge variant={config.lastRunStatus === "success" ? "success" : "danger"}>
                  {config.lastRunStatus === "success" ? "Success" : "Error"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Last Run:</span>
                <span className="text-xs font-medium text-mineshaft-100">
                  {format(new Date(config.lastRunAt), "yyyy-MM-dd, hh:mm a")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Certificates Removed:</span>
                <span className="text-xs font-medium text-mineshaft-100">
                  {config.lastRunCertsDeleted}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-mineshaft-100">Delete certificates after</span>
            <Controller
              control={control}
              name="daysBeforeDeletion"
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  type="number"
                  className="w-20"
                  min={1}
                  max={30}
                  disabled={!isEnabled}
                />
              )}
            />
            <span className="text-sm text-gray-400">days past expiration</span>
          </div>

          <div className="flex flex-col divide-y divide-mineshaft-600">
            <Controller
              control={control}
              name="includeRevokedCertificates"
              render={({ field: { value, onChange } }) => (
                <div className="flex items-center gap-4 py-4">
                  <Switch
                    variant="project"
                    checked={isEnabled && value}
                    onCheckedChange={onChange}
                    disabled={!isEnabled}
                  />
                  <div>
                    <p className="text-sm font-medium text-mineshaft-100">
                      Include Revoked Certificates
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Also remove revoked certificates even if they haven&apos;t expired yet
                    </p>
                  </div>
                </div>
              )}
            />

            <Controller
              control={control}
              name="skipCertsWithActiveSyncs"
              render={({ field: { value, onChange } }) => (
                <div className="flex items-center gap-4 py-4">
                  <Switch
                    variant="project"
                    checked={isEnabled && value}
                    onCheckedChange={onChange}
                    disabled={!isEnabled}
                  />
                  <div>
                    <p className="text-sm font-medium text-mineshaft-100">
                      Skip Certificates with Active Syncs
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Do not remove certificates that are synced to external services
                    </p>
                  </div>
                </div>
              )}
            />
          </div>

          {isDirty && (
            <Button type="submit" variant="project" isPending={isSubmitting}>
              Save
            </Button>
          )}
        </div>
      </div>
    </form>
  );
};
