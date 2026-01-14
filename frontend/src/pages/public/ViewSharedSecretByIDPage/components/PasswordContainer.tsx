import { Controller, useForm } from "react-hook-form";
import { faArrowRight, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { Button, FormControl, IconButton, Input } from "@app/components/v2";

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
      className={`rounded-lg border p-4 ${brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-800"}`}
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
                labelClassName="text-[var(--muted-color)]"
              >
                <div className="flex items-center justify-between gap-2 rounded-md">
                  <Input
                    {...field}
                    placeholder="Enter password to view secret"
                    type="password"
                    style={inputStyle}
                    className={twMerge(
                      "h-9",
                      brandingTheme &&
                        "border placeholder-[var(--muted-color)]/70 focus:ring-[var(--muted-color)]/50"
                    )}
                    containerClassName="bg-transparent border-transparent h-9"
                  />
                  <div className="flex">
                    <IconButton
                      ariaLabel="submit password"
                      colorSchema="secondary"
                      className="group relative size-9 hover:opacity-70"
                      onClick={handleSubmit(onFormSubmit)}
                      style={inputStyle}
                    >
                      <FontAwesomeIcon
                        className={isSubmitting ? "fa-spin" : ""}
                        icon={isSubmitting ? faSpinner : faArrowRight}
                      />
                    </IconButton>
                  </div>
                </div>
              </FormControl>
            </div>
          )}
        />
      </form>
      {!brandingTheme && (
        <Button
          className="w-full bg-mineshaft-700 py-3 text-bunker-200"
          colorSchema="primary"
          variant="outline_bg"
          size="sm"
          onClick={() => window.open("/share-secret", "_blank", "noopener")}
          rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
        >
          Share Your Own Secret
        </Button>
      )}
    </div>
  );
};
