import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ForwardIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Button, Field, FieldError, FieldLabel, TextArea } from "@app/components/v3";
import { useSetSecretRequestValue } from "@app/hooks/api";

import { BrandingTheme } from "../../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";

const formSchema = z.object({
  secretValue: z.string().min(1)
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  brandingTheme?: BrandingTheme;
  onSuccess: () => void;
  secretRequestId: string;
};

export const SecretRequestContainer = ({ brandingTheme, onSuccess, secretRequestId }: Props) => {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const { mutateAsync: setSecretValue, isPending } = useSetSecretRequestValue();

  const onSubmit = async (data: FormData) => {
    await setSecretValue({
      id: secretRequestId,
      secretValue: data.secretValue
    });

    onSuccess();
  };

  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  const inputStyle = brandingTheme
    ? ({
        backgroundColor: brandingTheme.inputBg,
        color: brandingTheme.textColor,
        "--muted-color": brandingTheme.textMutedColor,
        borderColor: brandingTheme.panelBorder
      } as React.CSSProperties)
    : undefined;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-4" style={panelStyle}>
          <Controller
            control={form.control}
            name="secretValue"
            render={({ field, fieldState: { error } }) => (
              <Field style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
                <FieldLabel
                  className={brandingTheme ? "text-[var(--muted-color)]" : ""}
                  style={
                    brandingTheme
                      ? ({ "--muted-color": brandingTheme.textMutedColor } as React.CSSProperties)
                      : undefined
                  }
                >
                  Secret Value
                </FieldLabel>
                <TextArea
                  {...field}
                  rows={10}
                  className={twMerge(
                    "resize-none",
                    brandingTheme &&
                      "border placeholder-[var(--muted-color)]/70 focus-visible:ring-[var(--muted-color)]/50"
                  )}
                  style={inputStyle}
                  aria-invalid={Boolean(error)}
                />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Button
            isPending={isPending}
            isDisabled={isPending || !form.formState.isValid}
            variant="project"
            isFullWidth
            size="lg"
            type="submit"
            style={inputStyle}
          >
            Share Secret
            <ForwardIcon />
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};
