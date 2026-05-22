import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ActivityIcon, Check, ClipboardCopy } from "lucide-react";

import {
  Badge,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageLoader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { useGetHoneyTokenEvents } from "@app/hooks/api/honeyTokens/queries";

type Props = {
  honeyTokenId: string;
  projectId: string;
};

const DEFAULT_PER_PAGE = 25;

const UserAgentCell = ({ userAgent }: { userAgent?: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({ initialState: "" });

  if (!userAgent) return <TableCell>—</TableCell>;

  return (
    <TableCell className="max-w-[150px]" isTruncatable>
      <div className="flex items-center gap-1">
        <span className="block truncate">{userAgent}</span>
        <IconButton
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={() => {
            setCopied(userAgent);
            navigator.clipboard.writeText(userAgent);
          }}
          aria-label="Copy user agent"
        >
          {isCopied ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
        </IconButton>
      </div>
    </TableCell>
  );
};

export const HoneyTokenEventsSection = ({ honeyTokenId, projectId }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const { data, isPending } = useGetHoneyTokenEvents({
    honeyTokenId,
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage
  });

  const events = data?.events;
  const totalCount = data?.totalCount ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <ActivityIcon size={16} className="text-muted" />
        <p className="text-sm font-medium">Events</p>
        {totalCount > 0 && (
          <Badge variant="neutral" className="text-xs">
            {totalCount}
          </Badge>
        )}
      </div>

      {isPending && <PageLoader />}

      {!isPending && (!events || events.length === 0) && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No events recorded yet</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {events && events.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>User Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const meta = event.metadata;
              const eventDate = meta?.eventTime
                ? new Date(meta.eventTime)
                : new Date(event.createdAt);

              return (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatDistanceToNow(eventDate, { addSuffix: true })}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(eventDate, "MMMM do, yyyy 'at' h:mm:ss a")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {meta?.eventName ? <Badge variant="neutral">{meta.eventName}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{meta?.awsRegion ?? "—"}</TableCell>
                  <TableCell>{meta?.sourceIp ?? "—"}</TableCell>
                  <UserAgentCell userAgent={meta?.userAgent} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Pagination
        count={totalCount}
        page={page}
        perPage={perPage}
        onChangePage={setPage}
        onChangePerPage={(newPerPage) => {
          const totalPages = Math.ceil(totalCount / newPerPage);
          if (page > totalPages) setPage(totalPages);
          setPerPage(newPerPage);
        }}
        perPageList={[25, 50, 100]}
      />
    </div>
  );
};
