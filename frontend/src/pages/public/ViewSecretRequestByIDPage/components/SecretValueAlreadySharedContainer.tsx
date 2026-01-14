import { KeyRoundIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { BrandingTheme } from "../../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
};

export const SecretValueAlreadySharedContainer = ({ brandingTheme }: Props) => {
  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        color: brandingTheme.textColor,
        "--muted-color": brandingTheme.textMutedColor,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  return (
    <div
      className={twMerge(
        "rounded-lg border p-6",
        !brandingTheme && "border-mineshaft-600 bg-mineshaft-800"
      )}
      style={panelStyle}
    >
      <div className="flex items-center gap-4">
        <KeyRoundIcon
          className="size-8 shrink-0"
          style={{ color: brandingTheme?.textMutedColor || "white" }}
        />
        <div className="flex flex-col">
          <span className="font-medium">Secret Already Shared</span>
          <span
            className={`text-sm ${brandingTheme ? "text-[var(--muted-color)]" : "text-mineshaft-300"}`}
          >
            A secret value has already been shared for this secret request.
          </span>
        </div>
      </div>
    </div>
  );
};
