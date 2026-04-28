import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Button, Field, FieldError, FieldLabel, Input } from "@app/components/v3";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";

type Props = {
  onPasswordSubmit: (val: any) => void;
  isSubmitting?: boolean;
  isInvalidCredential?: boolean;
  brandingTheme?: BrandingTheme;
};

const formSchema = z.object({
  password: z.string()
});

export type FormData = z.infer<typeof formSchema>;

export const PasswordContainer = ({
  onPasswordSubmit,
  isSubmitting,
  isInvalidCredential,
  brandingTheme
}: Props) => {
  const {
    control,
    handleSubmit,
    formState: { isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: ""
    }
  });

  const onFormSubmit = async ({ password }: FormData) => {
    onPasswordSubmit(password);
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
    <div style={panelStyle}>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          name="password"
          defaultValue=""
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
                Password
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  {...field}
                  autoFocus
                  placeholder="Enter password to view secret"
                  type="password"
                  style={inputStyle}
                  className={twMerge(
                    "flex-1",
                    brandingTheme &&
                      "border placeholder:text-[var(--muted-color)]/50 focus-visible:ring-[var(--muted-color)]/50"
                  )}
                  isError={Boolean(error) || isInvalidCredential}
                />
              </div>
              {(error || isInvalidCredential) && (
                <FieldError>
                  {isInvalidCredential ? "Invalid credential" : error?.message}
                </FieldError>
              )}
            </Field>
          )}
        />
        <Button
          aria-label="submit password"
          variant="project"
          size="lg"
          isFullWidth
          className="mt-4"
          onClick={handleSubmit(onFormSubmit)}
          style={inputStyle}
          isPending={isSubmitting}
          isDisabled={!isDirty}
        >
          View Secret
        </Button>
      </form>
    </div>
  );
};
