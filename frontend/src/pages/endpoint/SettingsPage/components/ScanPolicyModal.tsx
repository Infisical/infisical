import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { TEndpointScanPolicy, useUpdateEndpointScanPolicy } from "@app/hooks/api/endpoint";

// One folder per line is the only input that stays readable for a handful of absolute paths, and it
// matches how the agent consumes them.
const linesToList = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

// Mirrors the backend's rule. A relative path would silently resolve against whatever directory the
// agent happens to be running in, so it is rejected here with a readable message instead of a 400.
const isAbsoluteOrHome = (value: string) =>
  value === "~" || value.startsWith("~/") || value.startsWith("/");

const formSchema = z.object({
  roots: z
    .string()
    .trim()
    .min(1, "Add at least one folder to scan")
    .refine((value) => linesToList(value).every(isAbsoluteOrHome), {
      message: "Each folder must be an absolute path such as /Users/alice/Desktop, or start with ~"
    })
    .refine((value) => linesToList(value).length <= 50, { message: "At most 50 folders" }),
  excludePatterns: z.string().trim(),
  intervalHours: z.coerce.number().int().positive().max(720),
  maxFileMegabytes: z.coerce.number().int().positive().max(64)
});

type TFormData = z.infer<typeof formSchema>;

type Props = {
  policy?: TEndpointScanPolicy;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const ScanPolicyModal = ({ policy, isOpen, onOpenChange }: Props) => {
  const updatePolicy = useUpdateEndpointScanPolicy();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    if (!isOpen) return;

    reset({
      roots: (policy?.roots ?? []).join("\n"),
      excludePatterns: (policy?.excludePatterns ?? []).join("\n"),
      intervalHours: policy?.intervalHours ?? 24,
      maxFileMegabytes: policy?.maxFileMegabytes ?? 2
    });
  }, [isOpen, policy, reset]);

  const onSubmit = async (data: TFormData) => {
    try {
      await updatePolicy.mutateAsync({
        // Editing the folders never turns scanning on or off by itself; that is the switch on the page.
        isEnabled: policy?.isEnabled ?? false,
        roots: linesToList(data.roots),
        excludePatterns: linesToList(data.excludePatterns),
        intervalHours: data.intervalHours,
        maxFileMegabytes: data.maxFileMegabytes
      });

      createNotification({ type: "success", text: "Scan policy updated" });
      onOpenChange(false);
    } catch (error) {
      createNotification({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update the scan policy"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Secret Scanning</DialogTitle>
          <DialogDescription>
            Which folders every device checks for credentials stored in files, and how often.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Folders to scan</FieldLabel>
              <FieldContent>
                <TextArea
                  {...register("roots")}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={"~/Desktop\n~/Documents\n~/Projects"}
                />
                <FieldDescription>
                  One per line. <span className="font-mono">~</span> resolves to the home directory of
                  the person the device belongs to. Narrow folders scan in seconds; a whole home
                  directory can take minutes.
                </FieldDescription>
                {errors.roots && <FieldError>{errors.roots.message}</FieldError>}
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Exclusions</FieldLabel>
              <FieldContent>
                <TextArea
                  {...register("excludePatterns")}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={"/\\.terraform/\n/vendor/"}
                />
                <FieldDescription>
                  Optional regular expressions matched against the full path, one per line. Caches,
                  dependency folders, media files and Infisical&apos;s own state are always excluded.
                </FieldDescription>
                {errors.excludePatterns && <FieldError>{errors.excludePatterns.message}</FieldError>}
              </FieldContent>
            </Field>

            <div className="flex gap-4">
              <Field className="flex-1">
                <FieldLabel>Scan every</FieldLabel>
                <FieldContent>
                  <Input {...register("intervalHours")} type="number" min={1} max={720} />
                  <FieldDescription>Hours between a device&apos;s own scans.</FieldDescription>
                  {errors.intervalHours && <FieldError>{errors.intervalHours.message}</FieldError>}
                </FieldContent>
              </Field>

              <Field className="flex-1">
                <FieldLabel>Skip files larger than</FieldLabel>
                <FieldContent>
                  <Input {...register("maxFileMegabytes")} type="number" min={1} max={64} />
                  <FieldDescription>
                    Megabytes. Credentials live in small files, so a low value costs nothing.
                  </FieldDescription>
                  {errors.maxFileMegabytes && (
                    <FieldError>{errors.maxFileMegabytes.message}</FieldError>
                  )}
                </FieldContent>
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="endpoint"
              type="submit"
              isPending={isSubmitting || updatePolicy.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
