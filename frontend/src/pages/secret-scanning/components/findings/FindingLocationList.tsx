import { useEffect } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  Skeleton
} from "@app/components/v3";
import {
  TSecretScanningFindingLocation,
  useListSecretScanningFindingLocations
} from "@app/hooks/api/secretScanningV2";

type Props = {
  findingId: string;
  locationCount: number;
};

const formatDate = (date: string) => format(new Date(date), "MMM d, yyyy h:mm a");

const formatRange = (start: number, end: number) =>
  start === end ? `${start}` : `${start}-${end}`;

const LocationDetails = ({ location }: { location: TSecretScanningFindingLocation }) => {
  const { details } = location;
  const position = `${details.file}:${details.startLine}`;

  return (
    <div className="grid grid-cols-2 gap-4">
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

export const FindingLocationList = ({ findingId, locationCount }: Props) => {
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useListSecretScanningFindingLocations(findingId);

  // the findings table polls, so a scan that finds the secret somewhere new changes the count while this is open
  const loadedCount = data?.pages[0]?.totalCount;
  useEffect(() => {
    if (loadedCount !== undefined && loadedCount !== locationCount) refetch();
  }, [locationCount, loadedCount]);

  const locations = data?.pages.flatMap((page) => page.locations) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        {locationCount === 1 ? "1 Location" : `${locationCount} Locations`}
      </span>
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
                    {details.file}:{details.startLine}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {details.commit.slice(0, 7)}
                    {details.date &&
                      ` · ${formatDistanceToNowStrict(new Date(details.date), { addSuffix: true })}`}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="p-3">
                  <LocationDetails location={location} />
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
