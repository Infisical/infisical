import { Check, Copy, Eye, EyeOff } from "lucide-react";

import { Button, IconButton } from "@app/components/v3";
import { useTimedReset, useToggle } from "@app/hooks";
import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

// Fixed length so the mask never discloses how long the value is.
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

  const iconButtonStyle = brandingTheme ? { color: brandingTheme.textMutedColor } : undefined;

  return (
    <div style={panelStyle}>
      <div
        className={`relative rounded-md border p-3 ${
          brandingTheme ? "" : "border-border bg-container text-label"
        }`}
        style={secretDisplayStyle}
      >
        <p className="max-h-64 thin-scrollbar overflow-y-auto pr-9 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
          {isVisible ? secret.secretValue : HIDDEN_SECRET}
        </p>
        <IconButton
          variant="ghost"
          size="sm"
          className="absolute top-1.5 right-1.5"
          aria-label={isVisible ? "Hide value" : "Reveal value"}
          onClick={() => setIsVisible.toggle()}
          style={iconButtonStyle}
        >
          {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
      </div>

      <Button
        className="mt-3"
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

      {hasCopyFailed && (
        <p className="mt-2 text-2xs text-danger">
          Your browser blocked clipboard access. Reveal the value and copy it manually.
        </p>
      )}

      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />

      {!brandingTheme && (
        <div className="mt-5 border-t border-border pt-4 text-center">
          <a
            href="/share-secret"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            Share your own secret
          </a>
        </div>
      )}
    </div>
  );
};
