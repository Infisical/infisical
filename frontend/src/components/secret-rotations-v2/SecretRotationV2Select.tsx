import { useMemo, useState } from "react";
import { AlertTriangleIcon, Loader2Icon, SearchIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  SECRET_ROTATION_CONNECTION_MAP,
  SECRET_ROTATION_MAP
} from "@app/helpers/secretRotationsV2";
import { SecretRotation, useSecretRotationV2Options } from "@app/hooks/api/secretRotationsV2";

type Props = {
  onSelect: (type: SecretRotation) => void;
};

const ProviderCard = ({ type, onSelect }: { type: SecretRotation; onSelect: () => void }) => {
  const { image, name } = SECRET_ROTATION_MAP[type];
  const connectionName = APP_CONNECTION_MAP[SECRET_ROTATION_CONNECTION_MAP[type]].name;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-foreground/15 hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-container">
          <img
            src={`/images/integrations/${image}`}
            alt={`${name} logo`}
            className="size-6 object-contain"
          />
        </div>
        <span className="text-xs font-medium text-muted">{connectionName}</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs leading-relaxed text-muted">
          Rotate {name} and write the generated values to Infisical secrets.
        </p>
      </div>
    </button>
  );
};

export const SecretRotationV2Select = ({ onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const { isPending, isError, data: secretRotationOptions, refetch } = useSecretRotationV2Options();

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return secretRotationOptions ?? [];

    return (secretRotationOptions ?? []).filter(({ type }) => {
      const { name } = SECRET_ROTATION_MAP[type];
      const connectionName = APP_CONNECTION_MAP[SECRET_ROTATION_CONNECTION_MAP[type]].name;
      return [name, connectionName, type].some((value) => value.toLowerCase().includes(query));
    });
  }, [search, secretRotationOptions]);

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10">
        <Loader2Icon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Loading providers...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangleIcon />
          </EmptyMedia>
          <EmptyTitle>Unable to load providers</EmptyTitle>
          <EmptyDescription>
            Try loading the available secret rotation providers again.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search providers — PostgreSQL, AWS, Cloudflare..."
          aria-label="Search secret rotation providers"
        />
      </InputGroup>

      <section>
        <p className="mb-3 text-xs font-medium text-muted">All providers</p>
        {filteredOptions.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredOptions.map(({ type }) => (
              <ProviderCard key={type} type={type} onSelect={() => onSelect(type)} />
            ))}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>
                {search.trim() ? "No matching providers" : "No providers available"}
              </EmptyTitle>
              <EmptyDescription>
                {search.trim()
                  ? "Try a different search term."
                  : "No secret rotation providers are available for this instance."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
};
