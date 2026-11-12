import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import {
  Button,
  CopyButton,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Skeleton
} from "@app/components/v3";
import { useListSecretScanningFindingLocations } from "@app/hooks/api/secretScanningV2";

type Props = {
  findingId: string;
  locationCount: number;
};

export const FindingLocationList = ({ findingId, locationCount }: Props) => {
  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useListSecretScanningFindingLocations(findingId);

  const locations = data?.pages.flatMap((page) => page.locations) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        {locationCount === 1 ? "1 Location" : `${locationCount} Locations`}
      </span>
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <ItemGroup>
          {locations.map(({ id, fingerprint, details }) => {
            const position = `${details.file}:${details.startLine}`;

            return (
              <Item key={id} variant="outline" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full">
                    {details.link ? (
                      <a
                        href={details.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 hover:underline hover:underline-offset-2"
                      >
                        <ExternalLinkIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{position}</span>
                      </a>
                    ) : (
                      <span className="truncate">{position}</span>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {details.commit.slice(0, 7)} by {details.author}
                    {details.date && ` on ${format(new Date(details.date), "MMM d, yyyy")}`}
                  </ItemDescription>
                  {details.message && (
                    <p className="line-clamp-2 text-xs text-muted">{details.message}</p>
                  )}
                </ItemContent>
                <ItemActions>
                  <CopyButton value={fingerprint} ariaLabel="Copy fingerprint" />
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          isPending={isFetchingNextPage}
          isDisabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          Show More
        </Button>
      )}
    </div>
  );
};
