import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Button, InputGroup, InputGroupAddon, InputGroupInput, Label } from "@app/components/v3";
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
  const [search, setSearch] = useState("");

  const allOptions = useMemo(() => {
    if (!resourceOptions) return [];
    return [...resourceOptions, ...COMING_SOON_RESOURCES].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [resourceOptions]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter((option) => {
      const details = PAM_RESOURCE_TYPE_MAP[option.resource];
      return details.name.toLowerCase().includes(searchLower);
    });
  }, [allOptions, search]);

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
      <div className="flex flex-col overflow-hidden">
        <div className="p-4 pb-2">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resources..."
            />
          </InputGroup>
        </div>
        <div className="flex flex-1 overflow-y-auto">
          <div className="flex h-fit w-full flex-col gap-2 p-4 pt-2">
            {filteredOptions.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted">
                No resources found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const details = PAM_RESOURCE_TYPE_MAP[option.resource];

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
                  </Button>
                );
              })
            )}
          </div>
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
