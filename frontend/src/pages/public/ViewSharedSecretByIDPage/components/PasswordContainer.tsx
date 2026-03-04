import { Controller, useForm } from "react-hook-form";
import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { FormControl, Input } from "@app/components/v2";

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
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(formSchema)
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
    ? {
        backgroundColor: brandingTheme.inputBg,
        color: brandingTheme.textColor,
        "--muted-color": brandingTheme.textMutedColor,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  return (
    <div
      className={`rounded-lg border px-4 pt-5 pb-1 ${brandingTheme ? "" : "border-mineshaft-500 bg-mineshaft-800"}`}
      style={panelStyle}
    >
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          name="password"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <div style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
              <FormControl
                isError={Boolean(error) || isInvalidCredential}
                errorText={isInvalidCredential ? "Invalid credential" : error?.message}
                isRequired
                label="Password"
                labelClassName="mb-2 text-[var(--muted-color)]"
              >
                <div className="flex items-center justify-between gap-2 rounded-md">
                  <Input
                    {...field}
                    placeholder="Enter password to view secret"
                    type="text"
                    style={{
                      ...inputStyle,
                      WebkitTextSecurity: "disc"
                    } as React.CSSProperties}
                    className={twMerge(
                      "h-9 border border-mineshaft-500 rounded-md",
                      brandingTheme &&
                        "border placeholder-[var(--muted-color)]/70 focus:ring-[var(--muted-color)]/50"
                    )}
                    autoComplete="off"
                    containerClassName="bg-transparent border-mineshaft-500 h-9 rounded-md"
                  />
                  <button
                    type="button"
                    className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-mineshaft-500 bg-mineshaft-700/50 text-sm text-mineshaft-300 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-white"
                    onClick={handleSubmit(onFormSubmit)}
                    style={brandingTheme ? inputStyle : undefined}
                  >
                    <FontAwesomeIcon
                      className={isSubmitting ? "fa-spin" : ""}
                      icon={isSubmitting ? faSpinner : faArrowRight}
                    />
                  </button>
                </div>
              </FormControl>
            </div>
          )}
        />
      </form>
    </div>
  );
};
