import { ClipboardCheckIcon, Copy, Eye, EyeOff, ForwardIcon, ShieldCheck } from "lucide-react";

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

  const hiddenSecret = "••••••••••••••••";

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
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-success" />
        Shared Secret
      </div>
      <div
        className={`flex min-h-24 items-start justify-between rounded-md border p-3 text-base ${
          brandingTheme ? "" : "border-border bg-container text-label"
        }`}
        style={secretDisplayStyle}
      >
        <p className="min-w-0 pt-1 font-mono break-all whitespace-pre-wrap">
          {isVisible ? secret.secretValue : hiddenSecret}
        </p>
        <div className="ml-2 flex shrink-0 items-start gap-1 self-start">
          <IconButton
            aria-label={isCopyingSecret ? "Secret copied" : "Copy secret"}
            variant="ghost"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(secret.secretValue);
              setCopyTextSecret("Copied");
            }}
            style={iconButtonStyle}
          >
            {isCopyingSecret ? (
              <ClipboardCheckIcon className="size-4 text-success" />
            ) : (
              <Copy className="size-4" />
            )}
          </IconButton>
          <IconButton
            aria-label={isVisible ? "Hide secret" : "Reveal secret"}
            variant="ghost"
            size="sm"
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
