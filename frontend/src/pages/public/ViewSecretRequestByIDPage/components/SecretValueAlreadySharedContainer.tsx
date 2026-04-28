import { KeyRoundIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { BrandingTheme } from "../../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";

type Props = {
  brandingTheme?: BrandingTheme;
};

export const SecretValueAlreadySharedContainer = ({ brandingTheme }: Props) => {
  const panelStyle = brandingTheme
    ? ({
        backgroundColor: brandingTheme.panelBg,
        color: brandingTheme.textColor,
        borderColor: brandingTheme.panelBorder
      } as React.CSSProperties)
    : undefined;

  return (
    <Alert variant={brandingTheme ? "default" : "info"} style={panelStyle}>
      <KeyRoundIcon style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined} />
      <AlertTitle style={brandingTheme ? { color: brandingTheme.textColor } : undefined}>
        Secret Already Shared
      </AlertTitle>
      <AlertDescription style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}>
        A secret value has already been shared for this secret request.
      </AlertDescription>
    </Alert>
  );
};
