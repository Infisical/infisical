import { useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton
} from "@app/components/v3";
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import {
  TSecretScanningFindingLocation,
  TSecretScanningFindingResource,
  useListSecretScanningFindingLocations
} from "@app/hooks/api/secretScanningV2";

type Props = {
  findingId: string;
  locationCount: number;
  resources: TSecretScanningFindingResource[];
  initialResourceId: string | null;
};

const ALL_RESOURCES = "all";

const formatDate = (date: string) => format(new Date(date), "MMM d, yyyy h:mm a");

const formatRange = (start: number, end: number) =>
  start === end ? `${start}` : `${start}-${end}`;

const LocationDetails = ({
  location,
  resource
}: {
  location: TSecretScanningFindingLocation;
  resource?: TSecretScanningFindingResource;
}) => {
  const { details } = location;
  const position = `${details.file}:${details.startLine}`;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Detail className="col-span-2">
        <DetailLabel>
          {resource
            ? RESOURCE_DESCRIPTION_HELPER[resource.dataSourceType].singularTitle
            : "Resource"}
        </DetailLabel>
        <DetailValue>
          {location.resourceName}
          {resource && <p className="text-xs text-muted">{resource.dataSourceName}</p>}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>File</DetailLabel>
        <DetailValue>
          {details.link ? (
            <a
              href={details.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:underline hover:underline-offset-2"
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" />
              {position}
            </a>
          ) : (
            position
          )}
          {details.symlinkFile && (
            <p className="text-xs text-muted">Linked from {details.symlinkFile}</p>
          )}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Lines</DetailLabel>
        <DetailValue>
          {formatRange(details.startLine, details.endLine)}
          <p className="text-xs text-muted">
            Columns {formatRange(details.startColumn, details.endColumn)}
          </p>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Commit</DetailLabel>
        <DetailValue>
          {details.commit.slice(0, 7)}
          {details.message && <p className="line-clamp-3 text-xs text-muted">{details.message}</p>}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Author</DetailLabel>
        <DetailValue>
          {details.author}
          {details.email && <p className="text-xs text-muted">{details.email}</p>}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Committed</DetailLabel>
        <DetailValue>{details.date ? formatDate(details.date) : "-"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>First Found</DetailLabel>
        <DetailValue>{formatDate(location.createdAt)}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Rule</DetailLabel>
        <DetailValue>{location.rule}</DetailValue>
      </Detail>
      {details.tags?.length > 0 && (
        <Detail className="col-span-2">
          <DetailLabel>Tags</DetailLabel>
          <DetailValue>{details.tags.join(", ")}</DetailValue>
        </Detail>
      )}
    </div>
  );
};

export const FindingLocationList = ({
  findingId,
  locationCount,
  resources,
  initialResourceId
}: Props) => {
  const [resourceId, setResourceId] = useState<string | null>(initialResourceId);
  const selectedResource = resources.find((resource) => resource.id === resourceId);

  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useListSecretScanningFindingLocations(findingId, selectedResource?.id);

  // the findings table polls, so a scan that finds the secret somewhere new changes the count while this is open
  const expectedCount = selectedResource ? selectedResource.locationCount : locationCount;
  const loadedCount = data?.pages[0]?.totalCount;
  useEffect(() => {
    if (loadedCount !== undefined && loadedCount !== expectedCount) refetch();
  }, [expectedCount, loadedCount]);

  const locations = data?.pages.flatMap((page) => page.locations) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {expectedCount === 1 ? "1 Location" : `${expectedCount} Locations`}
        </span>
        {resources.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs">
                {selectedResource ? selectedResource.name : "Everywhere"}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={selectedResource?.id ?? ALL_RESOURCES}
                onValueChange={(next) => setResourceId(next === ALL_RESOURCES ? null : next)}
              >
                <DropdownMenuRadioItem value={ALL_RESOURCES}>Everywhere</DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                {resources.map((resource) => (
                  <DropdownMenuRadioItem key={resource.id} value={resource.id}>
                    <span className="truncate">{resource.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {isPending && <Skeleton className="h-16 w-full" />}
      {isError && !data && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted">
          Could not load the locations.
          <Button variant="outline" size="xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {data && (
        <Accordion type="multiple">
          {locations.map((location) => {
            const { details } = location;

            return (
              <AccordionItem key={location.id} value={location.id}>
                <AccordionTrigger className="min-h-10 overflow-hidden py-0">
                  <span className="flex-1 truncate text-left">
                    <span className="text-muted">{location.resourceName} · </span>
                    {details.file}:{details.startLine}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {details.commit.slice(0, 7)}
                    {details.date &&
                      ` · ${formatDistanceToNowStrict(new Date(details.date), { addSuffix: true })}`}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="p-3">
                  <LocationDetails
                    location={location}
                    resource={resources.find(({ id }) => id === location.resourceId)}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
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
