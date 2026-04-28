import { CheckCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { BrandingTheme } from "../../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
  requesterUsername: string;
};

export const SecretRequestSuccessContainer = ({ brandingTheme, requesterUsername }: Props) => {
  const panelStyle = brandingTheme
    ? ({
        backgroundColor: brandingTheme.panelBg,
        color: brandingTheme.textColor,
        borderColor: brandingTheme.panelBorder
      } as React.CSSProperties)
    : undefined;

  return (
    <Alert variant={brandingTheme ? "default" : "success"} style={panelStyle}>
      <CheckCircleIcon
        style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}
      />
      <AlertTitle style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
        Secret Shared
      </AlertTitle>
      <AlertDescription style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}>
        {requesterUsername} has now been notified of your shared secret, and will be able to access
        it shortly.
      </AlertDescription>
    </Alert>
  );
};
