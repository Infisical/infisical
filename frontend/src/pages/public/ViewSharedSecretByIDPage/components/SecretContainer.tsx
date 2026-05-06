import { ClipboardCheckIcon, Copy, Eye, EyeOff, ForwardIcon } from "lucide-react";

import { Button, IconButton } from "@app/components/v3";
import { useTimedReset, useToggle } from "@app/hooks";
import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

export const SecretContainer = ({ secret, brandingTheme }: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const hiddenSecret = "*".repeat(secret.secretValue.length);

  const panelStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.panelBg,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  const secretDisplayStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  const iconButtonStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.buttonBg,
        color: brandingTheme.textColor
      }
    : undefined;

  return (
    <div style={panelStyle}>
      <div
        className={`flex items-center justify-between rounded-md border p-2 pl-3 text-base ${
          brandingTheme ? "" : "border-border bg-container text-label"
        }`}
        style={secretDisplayStyle}
      >
        <p className="break-all whitespace-pre-wrap">
          {isVisible ? secret.secretValue : hiddenSecret}
        </p>
        <div className="ml-1 flex">
          <IconButton
            aria-label="copy icon"
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(secret.secretValue);
              setCopyTextSecret("Copied");
            }}
            style={iconButtonStyle}
          >
            {isCopyingSecret ? (
              <ClipboardCheckIcon className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </IconButton>
          <IconButton
            aria-label="toggle visibility"
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => setIsVisible.toggle()}
            style={iconButtonStyle}
          >
            {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </IconButton>
        </div>
      </div>
      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />
      {!brandingTheme && (
        <Button
          className="mt-4 w-full"
          variant="project"
          size="lg"
          onClick={() => window.open("/share-secret", "_blank", "noopener")}
        >
          Share Your Own Secret
          <ForwardIcon />
        </Button>
      )}
    </div>
  );
};
