import { useState } from "react";
import { LoaderIcon, SearchIcon } from "lucide-react";

import {
  SecretRotationSheetOption,
  SecretRotationSheetOptionHeader,
  SecretRotationSheetSelectionGroup
} from "@app/components/secret-rotations-v2/SecretRotationSheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SecretRotation, useSecretRotationV2Options } from "@app/hooks/api/secretRotationsV2";

type Props = {
  onSelect: (type: SecretRotation) => void;
};

export const SecretRotationV2Select = ({ onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const { isPending, data: secretRotationOptions } = useSecretRotationV2Options();

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted">
        <LoaderIcon className="size-6 animate-spin" />
        <p className="text-sm">Loading options...</p>
      </div>
    );
  }

  const searchQuery = search.trim().toLowerCase();
  const filteredOptions = searchQuery
    ? secretRotationOptions?.filter(({ type }) => {
        const { name } = SECRET_ROTATION_MAP[type];
        return name.toLowerCase().includes(searchQuery) || type.toLowerCase().includes(searchQuery);
      })
    : secretRotationOptions;

  return (
    <>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search providers..."
          aria-label="Search providers"
        />
      </InputGroup>
      {filteredOptions && filteredOptions.length > 0 ? (
        <SecretRotationSheetSelectionGroup>
          {filteredOptions.map(({ type }) => {
            const { image, name } = SECRET_ROTATION_MAP[type];

            return (
              <SecretRotationSheetOption
                key={type}
                role="button"
                tabIndex={0}
                className="flex h-full cursor-pointer items-center gap-2 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:border-primary/50 focus-visible:bg-primary/5 focus-visible:outline-none"
                onClick={() => onSelect(type)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(type);
                  }
                }}
              >
                <span className="flex size-5 shrink-0 items-center justify-center [&_img]:size-4 [&_svg]:size-4">
                  <img src={`/images/integrations/${image}`} alt={`${name} logo`} />
                </span>
                <SecretRotationSheetOptionHeader>{name}</SecretRotationSheetOptionHeader>
              </SecretRotationSheetOption>
            );
          })}
        </SecretRotationSheetSelectionGroup>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching providers</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
};
