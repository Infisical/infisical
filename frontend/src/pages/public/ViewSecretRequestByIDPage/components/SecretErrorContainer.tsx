import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertTitle } from "@app/components/v3";

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
    <Alert variant={brandingTheme ? "default" : "danger"} style={panelStyle}>
      <TriangleAlertIcon
        style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}
      />
      <AlertTitle style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
        {error || "The secret request you are looking for is missing or has expired."}
      </AlertTitle>
    </Alert>
  );
};
