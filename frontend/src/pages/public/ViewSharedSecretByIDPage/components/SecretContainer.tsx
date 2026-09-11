import { ClipboardCheckIcon, Copy, Eye, EyeOff } from "lucide-react";

import { Button, InputGroup, InputGroupButton, InputGroupTextArea } from "@app/components/v3";
import { useTimedReset, useToggle } from "@app/hooks";
import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";
import { SecretShareInfo } from "./SecretShareInfo";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
  description?: string;
};

export const SecretContainer = ({ secret, brandingTheme, description }: Props) => {
  const [isVisible, setIsVisible] = useToggle(false);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const secretDisplayStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textColor
      }
    : undefined;

  const inputGroupStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.buttonBg,
        borderColor: brandingTheme.panelBorder
      }
    : undefined;

  return (
    <>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {description && (
          <p
            className={brandingTheme ? "text-sm" : "text-sm text-accent"}
            style={brandingTheme ? { color: brandingTheme.textMutedColor } : undefined}
          >
            {description}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 sm:ml-auto">
          <InputGroupButton
            aria-label="Copy shared secret value"
            onClick={() => {
              navigator.clipboard.writeText(secret.secretValue);
              setCopyTextSecret("Copied");
            }}
            style={inputGroupStyle}
          >
            {isCopyingSecret ? (
              <ClipboardCheckIcon className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </InputGroupButton>
          {isVisible && (
            <InputGroupButton
              aria-label="Hide shared secret value"
              onClick={() => setIsVisible.toggle()}
              style={inputGroupStyle}
            >
              <EyeOff className="size-4" />
            </InputGroupButton>
          )}
        </div>
      </div>
      {isVisible ? (
        <InputGroup
          className="min-h-24 items-start"
          style={brandingTheme ? secretDisplayStyle : undefined}
        >
          <InputGroupTextArea
            aria-label="Shared secret value"
            value={secret.secretValue}
            readOnly
            className={`min-h-24 text-base ${brandingTheme ? "" : "text-label"}`}
            style={brandingTheme ? secretDisplayStyle : undefined}
          />
        </InputGroup>
      ) : (
        <Button
          className="min-h-24 w-full"
          variant="outline"
          onClick={() => setIsVisible.toggle()}
          style={brandingTheme ? secretDisplayStyle : undefined}
        >
          <Eye className="size-4" />
          Reveal
        </Button>
      )}
      <SecretShareInfo secret={secret} brandingTheme={brandingTheme} />
    </>
  );
};
