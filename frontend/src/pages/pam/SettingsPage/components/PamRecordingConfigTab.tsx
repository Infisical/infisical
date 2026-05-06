import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { AlertTriangleIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useDeletePamRecordingConfig,
  useGetPamRecordingConfig,
  useUpsertPamRecordingConfig
} from "@app/hooks/api/pam/recording-config";

const formSchema = z.object({
  storageBackend: z.literal("aws-s3"),
  connectionId: z.string().uuid({ message: "Select an AWS connection" }),
  bucket: z.string().trim().min(1, "Bucket is required").max(255),
  region: z.string().trim().min(1, "Region is required").max(64),
  keyPrefix: z.string().trim().max(255).optional()
});

type FormData = z.infer<typeof formSchema>;

export const PamRecordingConfigTab = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const projectId = currentProject?.id ?? "";
  const recordingConfig = useGetPamRecordingConfig(projectId);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);

  const { data: awsConnections, isLoading: connectionsLoading } = useListAvailableAppConnections(
    AppConnection.AWS,
    projectId
  );

  const upsertMutation = useUpsertPamRecordingConfig();
  const deleteMutation = useDeletePamRecordingConfig();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      storageBackend: "aws-s3",
      connectionId: "",
      bucket: "",
      region: "us-east-1",
      keyPrefix: ""
    }
  });

  // Defer the reset until BOTH the saved config and the available-connections list have loaded
  useEffect(() => {
    if (recordingConfig.data && awsConnections) {
      reset({
        storageBackend: "aws-s3",
        connectionId: recordingConfig.data.connectionId,
        bucket: recordingConfig.data.bucket,
        region: recordingConfig.data.region,
        keyPrefix: recordingConfig.data.keyPrefix ?? ""
      });
    }
  }, [recordingConfig.data, awsConnections, reset]);

  const onSave = handleSubmit(async (values) => {
    const { corsProbeUrl } = await upsertMutation.mutateAsync({
      projectId,
      ...values,
      keyPrefix: values.keyPrefix?.trim() ? values.keyPrefix : null
    });
    createNotification({ type: "success", text: "Session recording configuration saved" });

    if (corsProbeUrl) {
      try {
        await fetch(corsProbeUrl, { mode: "cors" });
      } catch {
        createNotification(
          {
            title: "Bucket CORS not configured",
            type: "warning",
            text: (
              <span>
                Session playback requires the bucket to allow GET requests from this origin.{" "}
                <a
                  href="https://infisical.com/docs/documentation/platform/pam/product-reference/external-storage#cors-configuration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  View CORS setup guide
                </a>
              </span>
            )
          },
          { autoClose: 10000 }
        );
      }
    }
  });

  const onDelete = async () => {
    if (!projectId) return;
    await deleteMutation.mutateAsync({ projectId });
    reset({
      storageBackend: "aws-s3",
      connectionId: "",
      bucket: "",
      region: "us-east-1",
      keyPrefix: ""
    });
    setIsDisableDialogOpen(false);
    createNotification({
      type: "success",
      text: "Session recording configuration removed"
    });
  };

  return (
    <div className="rounded-lg border border-border bg-container p-6">
      <h2 className="text-xl font-semibold text-foreground">Session Recording</h2>
      <p className="mt-1 text-sm text-muted">Store PAM session recordings in your own S3 bucket.</p>

      <Alert variant="warning" className="mt-4">
        <AlertTriangleIcon />
        <AlertTitle>Changing bucket affects existing recordings</AlertTitle>
        <AlertDescription>
          Changing the bucket on a project with existing recordings makes those recordings
          inaccessible unless you manually migrate the objects. Keep the same bucket and key prefix
          when rotating credentials.
        </AlertDescription>
      </Alert>

      <form className="mt-6 space-y-4" onSubmit={onSave}>
        <Controller
          control={control}
          name="connectionId"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>AWS Connection</FieldLabel>
              <FieldContent>
                <Select
                  disabled={connectionsLoading || !awsConnections?.length}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        connectionsLoading ? "Loading connections…" : "Select connection"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(awsConnections ?? []).map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
        {!connectionsLoading && !awsConnections?.length && (
          <p className="-mt-2 text-xs text-yellow-500">
            No AWS connections available.{" "}
            <Link
              to="/organizations/$orgId/app-connections"
              params={{ orgId: currentOrg?.id ?? "" }}
              className="underline hover:text-yellow-400"
            >
              Create one in Organization Settings
            </Link>
          </p>
        )}

        <Controller
          control={control}
          name="bucket"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Bucket</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  placeholder="my-pam-recordings"
                  autoComplete="off"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="region"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Region</FieldLabel>
              <FieldContent>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {AWS_REGIONS.map(({ name, slug }) => (
                      <SelectItem key={slug} value={slug}>
                        {name} ({slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="keyPrefix"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel className="inline-flex flex-wrap items-baseline gap-1.5">
                Key Prefix
                <span className="text-xs font-normal text-muted">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="pam/prod"
                  autoComplete="off"
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  Prepended to every object key. Useful for sharing one bucket across multiple
                  projects or environments.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />

        <div className="flex items-center gap-x-3 pt-2">
          <Button
            variant="project"
            type="submit"
            isPending={upsertMutation.isPending || isSubmitting}
            isDisabled={!isDirty && !!recordingConfig.data}
          >
            {recordingConfig.data ? "Update" : "Save"}
          </Button>
          {recordingConfig.data && (
            <Button
              variant="danger"
              type="button"
              onClick={() => setIsDisableDialogOpen(true)}
              isPending={deleteMutation.isPending}
            >
              Disable Recording
            </Button>
          )}
        </div>
      </form>

      <AlertDialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Disable Session Recording</AlertDialogTitle>
            <AlertDialogDescription>
              Existing recordings will become inaccessible until you reconfigure with the same
              bucket. Are you sure you want to disable session recording for this project?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onDelete}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
