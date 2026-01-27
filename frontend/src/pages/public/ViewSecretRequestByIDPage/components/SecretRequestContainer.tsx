import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { z } from "zod";

import { FormControl, TextArea } from "@app/components/v2";
import { Button } from "@app/components/v3";
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
    ? {
        backgroundColor: brandingTheme.inputBg,
        color: brandingTheme.textColor,
        "--muted-color": brandingTheme.textMutedColor,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div
          className={`flex flex-col rounded-lg border p-4 ${brandingTheme ? "" : "border-mineshaft-600 bg-mineshaft-800"}`}
          style={panelStyle}
        >
          <Controller
            control={form.control}
            name="secretValue"
            render={({ field, fieldState: { error } }) => (
              <div style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                  label="Secret Value"
                  labelClassName="text-[var(--muted-color)]"
                >
                  <TextArea
                    {...field}
                    rows={10}
                    reSize="none"
                    style={inputStyle}
                    className="border placeholder-[var(--muted-color)]/70 focus:ring-[var(--muted-color)]/50"
                  />
                </FormControl>
              </div>
            )}
          />
          <Button
            isPending={isPending}
            isDisabled={isPending}
            variant="neutral"
            className="w-full"
            type="submit"
            style={inputStyle}
          >
            Share Secret
            <ArrowRightIcon />
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};
