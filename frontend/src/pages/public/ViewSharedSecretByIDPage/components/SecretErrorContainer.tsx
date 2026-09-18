import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
  error?: string;
};

export const SecretErrorContainer = ({ error, brandingTheme }: Props) => {
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
        Unable to view shared secret
      </AlertTitle>
      <AlertDescription
        className="break-words"
        style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}
      >
        {error || "The secret you are looking for is missing or has expired"}
      </AlertDescription>
    </Alert>
  );
};
