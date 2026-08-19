import { Check, Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";

import { Button } from "@app/components/v3";
import { useTimedReset, useToggle } from "@app/hooks";
import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

const HIDDEN_SECRET = "••••••••••••••••";

export const SecretContainer = ({ secret, brandingTheme }: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const [hasCopyFailed, setHasCopyFailed] = useToggle(false);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

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

  const primaryButtonStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  const secondaryButtonStyle = brandingTheme
    ? {
        backgroundColor: "transparent",
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textMutedColor
      }
    : undefined;

  return (
    <div style={panelStyle}>
      <div
        className="mb-2 flex items-center gap-2 text-sm font-medium"
        style={brandingTheme ? { color: brandingTheme.textColor } : undefined}
      >
        <ShieldCheck
          className={`size-4 ${brandingTheme ? "" : "text-success"}`}
          style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}
        />
        Shared Secret
      </div>

      <div
        className={`min-h-24 rounded-md border p-3 text-base ${
          brandingTheme ? "" : "border-border bg-container text-label"
        }`}
        style={secretDisplayStyle}
      >
        <p className="min-w-0 font-mono break-all whitespace-pre-wrap">
          {isVisible ? secret.secretValue : HIDDEN_SECRET}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="outline"
          size="lg"
          isFullWidth
          onClick={() => setIsVisible.toggle()}
          style={secondaryButtonStyle}
        >
          {isVisible ? <EyeOff /> : <Eye />}
          {isVisible ? "Hide Value" : "Reveal Value"}
        </Button>
        <Button
          variant={brandingTheme ? "outline" : "project"}
          size="lg"
          isFullWidth
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret.secretValue);
              setCopyTextSecret("Copied");
            } catch {
              setHasCopyFailed.on();
            }
          }}
          style={primaryButtonStyle}
        >
          {isCopyingSecret ? <Check /> : <Copy />}
          {isCopyingSecret ? "Copied" : "Copy Value"}
        </Button>
      </div>

      {hasCopyFailed && (
        <p className="mt-2 text-2xs text-danger">
          Your browser blocked clipboard access. Reveal the value and copy it manually.
        </p>
      )}

      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />

      {!brandingTheme && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-accent"
            onClick={() => window.open("/share-secret", "_blank", "noopener")}
          >
            Share Your Own Secret
          </Button>
        </div>
      )}
    </div>
  );
};
