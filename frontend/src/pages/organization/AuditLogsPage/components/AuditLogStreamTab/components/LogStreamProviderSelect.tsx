import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader2Icon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { usePopUp } from "@app/hooks";
import { useGetAuditLogStreamOptions } from "@app/hooks/api";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";

type Props = {
  onSelect: (provider: LogProvider) => void;
};

export const LogStreamProviderSelect = ({ onSelect }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"]);

  const { isPending, data: logStreamOptions } = useGetAuditLogStreamOptions();

  const options = useMemo(
    () =>
      [
        ...(logStreamOptions || []),
        // QRadar is a planned provider
        { name: "IBM QRadar", provider: LogProvider.QRadar }
      ].sort((a, b) => {
        if (a.provider === LogProvider.Custom) return 1;
        if (b.provider === LogProvider.Custom) return -1;
        return 0;
      }),
    [logStreamOptions]
  );

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10">
        <Loader2Icon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const { image, icon, name, size = 50 } = AUDIT_LOG_STREAM_PROVIDER_MAP[option.provider];

          return (
            <button
              key={option.provider}
              type="button"
              onClick={() => {
                if (option.provider === LogProvider.QRadar) {
                  handlePopUpOpen("upgradePlan", {
                    isEnterpriseFeature: true
                  });
                } else {
                  onSelect(option.provider);
                }
              }}
              className="group flex h-28 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-container-hover"
            >
              {image && (
                <img
                  src={`/images/integrations/${image}`}
                  style={{
                    width: `${size}px`
                  }}
                  alt={`${name} logo`}
                />
              )}
              {icon && (
                <FontAwesomeIcon
                  className="text-accent"
                  icon={icon}
                  style={{ width: `${size * 0.8}px`, height: `${size * 0.8}px` }}
                />
              )}
              <div className="max-w-xs text-center text-xs font-medium text-foreground">{name}</div>
            </button>
          );
        })}
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to this audit log stream provider. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
