import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";

import { Button, InputGroup, InputGroupAddon, InputGroupInput, Label } from "@app/components/v3";
import {
  PAM_DOMAIN_TYPE_MAP,
  PamDomainType,
  useListPamDomainOptions
} from "@app/hooks/api/pamDomain";

type Props = {
  onSelect: (domainType: PamDomainType) => void;
};

export const DomainTypeSelect = ({ onSelect }: Props) => {
  const { isPending, data: domainOptions } = useListPamDomainOptions();
  const [search, setSearch] = useState("");

  const allOptions = useMemo(() => {
    if (!domainOptions) return [];
    return domainOptions.sort((a, b) => a.name.localeCompare(b.name));
  }, [domainOptions]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter((option) => option.name.toLowerCase().includes(searchLower));
  }, [allOptions, search]);

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Label>Loading options...</Label>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-4 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain types..."
          />
        </InputGroup>
      </div>
      <div className="flex flex-1 overflow-y-auto">
        <div className="flex h-fit w-full flex-col gap-2 p-4 pt-2">
          {filteredOptions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted">
              No domain types found
            </div>
          ) : (
            filteredOptions.map((option) => {
              const details = PAM_DOMAIN_TYPE_MAP[option.domain as PamDomainType];

              return (
                <Button
                  key={option.domain}
                  onClick={() => onSelect(option.domain as PamDomainType)}
                  size="lg"
                  variant="neutral"
                  className="w-full justify-start"
                >
                  {details?.image && (
                    <img
                      src={`/images/integrations/${details.image}`}
                      className="size-6"
                      alt={`${details.name} logo`}
                    />
                  )}
                  <Label className="pointer-events-none">{details?.name || option.name}</Label>
                </Button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
