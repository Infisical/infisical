import { useMemo } from "react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Button, Label } from "@app/components/v3";
import { usePopUp } from "@app/hooks";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamResourceType,
  useListPamResourceOptions
} from "@app/hooks/api/pam";

type Props = {
  onSelect: (resource: PamResourceType) => void;
};

const COMING_SOON_RESOURCES = [
  { name: "OracleDB", resource: PamResourceType.OracleDB },
  { name: "SQLite", resource: PamResourceType.SQLite },
  { name: "MongoDB", resource: PamResourceType.MongoDB },
  { name: "Cassandra", resource: PamResourceType.Cassandra },
  { name: "CockroachDB", resource: PamResourceType.CockroachDB },
  { name: "DynamoDB", resource: PamResourceType.DynamoDB },
  { name: "Snowflake", resource: PamResourceType.Snowflake },
  { name: "Elasticsearch", resource: PamResourceType.Elasticsearch },
  { name: "RDP", resource: PamResourceType.RDP },
  { name: "MCP", resource: PamResourceType.MCP },
  { name: "Web Application", resource: PamResourceType.WebApp }
];

const COMING_SOON_SET = new Set(COMING_SOON_RESOURCES.map((r) => r.resource));

export const ResourceTypeSelect = ({ onSelect }: Props) => {
  const { isPending, data: resourceOptions } = useListPamResourceOptions();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const allOptions = useMemo(() => {
    if (!resourceOptions) return [];
    return [...resourceOptions, ...COMING_SOON_RESOURCES].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [resourceOptions]);

  const handleResourceSelect = (resource: PamResourceType) => {
    if (COMING_SOON_SET.has(resource)) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to this resource type. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
      return;
    }

    onSelect(resource);
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Label>Loading options...</Label>
      </div>
    );
  }

  return (
    <>
      <div className="flex overflow-y-auto">
        <div className="flex h-fit w-full flex-col gap-2 p-4">
          {allOptions.map((option) => {
            const details = PAM_RESOURCE_TYPE_MAP[option.resource];
            const isComingSoon = COMING_SOON_SET.has(option.resource);

            return (
              <Button
                key={option.resource}
                onClick={() => handleResourceSelect(option.resource)}
                size="lg"
                variant="neutral"
                className="w-full justify-start"
              >
                <img
                  src={`/images/integrations/${details.image}`}
                  className="size-6"
                  alt={`${details.name} logo`}
                />
                <Label className="pointer-events-none">{details.name}</Label>
                {isComingSoon && <span className="ml-auto text-xs text-muted">Coming Soon</span>}
              </Button>
            );
          })}
        </div>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
