import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Switch
} from "@app/components/v3";
import {
  useGetCertificateCleanupConfig,
  useUpdateCertificateCleanupConfig
} from "@app/hooks/api/certificateCleanup";

const formSchema = z.object({
  isEnabled: z.boolean(),
  postExpiryRetentionDays: z.coerce.number().int().min(1).max(30),
  skipCertsWithActiveSyncs: z.boolean()
});

type TFormData = z.infer<typeof formSchema>;

export const CertificateCleanupTab = () => {
  const { data: config, isLoading } = useGetCertificateCleanupConfig();
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
      postExpiryRetentionDays: 3,
      skipCertsWithActiveSyncs: true
    }
  });

  useEffect(() => {
    if (config) {
      reset({
        isEnabled: config.isEnabled,
        postExpiryRetentionDays: config.postExpiryRetentionDays,
        skipCertsWithActiveSyncs: config.skipCertsWithActiveSyncs
      });
    }
  }, [config, reset]);

  const isEnabled = watch("isEnabled");

  const onSubmit = async (data: TFormData) => {
    try {
      await updateConfig.mutateAsync({
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
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-5 w-48" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-80" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Certificate Cleanup</CardTitle>
          <CardDescription>
            Automatically remove certificates that have been expired beyond a configurable retention
            window.
          </CardDescription>
          <CardAction className="@xs:self-center">
            <Controller
              control={control}
              name="isEnabled"
              render={({ field: { value, onChange } }) => (
                <Switch variant="project" checked={value} onCheckedChange={onChange} />
              )}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {config?.lastRunAt && (
            <div className="mb-6 rounded-md border border-border bg-foreground/[0.03] px-4 py-3">
              <p className="mb-2 text-xs font-medium tracking-wide text-accent uppercase">
                Last Execution
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-accent">Status:</span>
                  <Badge variant={config.lastRunStatus === "success" ? "success" : "danger"}>
                    {config.lastRunStatus === "success" ? "Success" : "Error"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-accent">Last Run:</span>
                  <span className="text-xs font-medium text-foreground">
                    {format(new Date(config.lastRunAt), "yyyy-MM-dd, hh:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-accent">Certificates Removed:</span>
                  <span className="text-xs font-medium text-foreground">
                    {config.lastRunCertsDeleted}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">Delete certificates</span>
              <Controller
                control={control}
                name="postExpiryRetentionDays"
                render={({ field }) => (
                  <Input
                    {...field}
                    type="number"
                    className="w-20"
                    min={1}
                    max={30}
                    disabled={!isEnabled}
                  />
                )}
              />
              <span className="text-sm text-accent">days after expiration</span>
            </div>

            <Controller
              control={control}
              name="skipCertsWithActiveSyncs"
              render={({ field: { value, onChange } }) => (
                <div className="flex items-center gap-4 border-t border-border py-4">
                  <Switch
                    variant="project"
                    checked={isEnabled && value}
                    onCheckedChange={onChange}
                    disabled={!isEnabled}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Skip Certificates with Active Syncs
                    </p>
                    <p className="mt-0.5 text-xs text-accent">
                      Do not remove certificates that are synced to external services
                    </p>
                  </div>
                </div>
              )}
            />

            {isDirty && (
              <div>
                <Button type="submit" variant="project" isPending={isSubmitting}>
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
};
