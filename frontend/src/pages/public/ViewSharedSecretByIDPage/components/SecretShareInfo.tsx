import { format } from "date-fns";
import { Clock, Eye } from "lucide-react";

import { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing";

import { BrandingTheme } from "../ViewSharedSecretByIDPage";

type Props = {
  secret: TAccessSharedSecretResponse;
  brandingTheme?: BrandingTheme;
};

export const SecretShareInfo = ({ secret, brandingTheme }: Props) => {
  let timeRemaining: string | null = null;

  if (secret.expiresAt) {
    try {
      timeRemaining = format(new Date(secret.expiresAt), "MMM d, yyyy 'at' h:mm a");
    } catch {
      timeRemaining = null;
    }
  }

  let viewsRemaining: number | null = null;

  if (secret.expiresAfterViews) {
    viewsRemaining = secret.expiresAfterViews - 1;
  }

  if (!timeRemaining && viewsRemaining === null) {
    return null;
  }

  const infoStyle = brandingTheme
    ? {
        backgroundColor: brandingTheme.inputBg,
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textMutedColor
      }
    : undefined;

  const iconStyle = brandingTheme ? { color: brandingTheme.textMutedColor } : undefined;

  return (
    <div
      className={`mt-4 flex flex-col gap-2 rounded-md border p-3 text-sm ${
        brandingTheme ? "" : "border-border bg-container text-label"
      }`}
      style={infoStyle}
    >
      {timeRemaining && (
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0" style={iconStyle} />
          <span>Expires on {timeRemaining}</span>
        </div>
      )}
      {viewsRemaining !== null && (
        <div className="flex items-center gap-2">
          <Eye className="size-3.5 shrink-0" style={iconStyle} />
          <span>
            {viewsRemaining === 0
              ? "This is the last time you can view this secret"
              : `${viewsRemaining} more view${viewsRemaining === 1 ? "" : "s"} remaining`}
          </span>
        </div>
      )}
    </div>
  );
};
