import { format } from "date-fns";
import { CalendarClock, Eye } from "lucide-react";

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
        borderColor: brandingTheme.panelBorder,
        color: brandingTheme.textMutedColor
      }
    : undefined;

  const iconStyle = brandingTheme ? { color: brandingTheme.textMutedColor } : undefined;

  return (
    <div
      className={`mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 ${
        brandingTheme ? "" : "border-border text-label"
      }`}
      style={infoStyle}
    >
      {timeRemaining && (
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" style={iconStyle} />
          <div>
            <p className="text-xs font-medium">Expires</p>
            <p className="mt-0.5 text-xs opacity-80">{timeRemaining}</p>
          </div>
        </div>
      )}
      {viewsRemaining !== null && (
        <div className="flex items-start gap-2">
          <Eye className="mt-0.5 size-3.5 shrink-0" style={iconStyle} />
          <div>
            <p className="text-xs font-medium">Views Remaining</p>
            <p className="mt-0.5 text-xs opacity-80">
              {viewsRemaining === 0 ? "Last available view" : viewsRemaining}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
