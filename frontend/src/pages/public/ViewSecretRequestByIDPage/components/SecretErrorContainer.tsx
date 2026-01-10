import { TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { BrandingTheme } from "../../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
  error?: string;
};

export const SecretRequestErrorContainer = ({ error, brandingTheme }: Props) => {
  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
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
        <TriangleAlertIcon
          className="shrink-0"
          style={{ color: brandingTheme?.textMutedColor || "orangered" }}
        />
        <span>{error || "The secret request you are looking for is missing or has expired."}</span>
      </div>
    </div>
  );
};
