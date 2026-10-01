import { FormEvent, useMemo, useState } from "react";
import { EyeIcon, EyeOffIcon, FolderIcon, KeyIcon } from "lucide-react";

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  ProjectIcon,
  SecretInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useGetUserProjects } from "@app/hooks/api";
import { useSearchSecretsByValue } from "@app/hooks/api/secretInsights";

import { GoToSecretFolderButton } from "./GoToSecretFolderButton";
import { SecretValueTrackingPrompt, useOrgSecretValueTracking } from "./SecretValueTrackingGate";

// Mirrors SECRET_VALUE_SEARCH_LIMIT on the server, which truncates without saying so.
const SEARCH_RESULT_LIMIT = 1000;

type Props = {
  orgId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const SearchContent = ({ orgId, onClose }: { orgId: string; onClose: () => void }) => {
  const [value, setValue] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const search = useSearchSecretsByValue();
  const { data: memberProjects } = useGetUserProjects();
  const memberProjectIds = useMemo(
    () => new Set(memberProjects?.map((project) => project.id)),
    [memberProjects]
  );

  const tracking = useOrgSecretValueTracking({ orgId, enabled: true });

  if (!tracking.isTrackingOn) {
    return (
      <div className="p-4">
        <SecretValueTrackingPrompt
          tracking={tracking}
          description="Enable secret value search to find every project, environment and path where a value is used."
        />
      </div>
    );
  }

  // Each search is an audited event, so it runs on submit rather than on every keystroke.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value) return;
    search.mutate({ secretValue: value });
  };

  const matches = search.data?.secrets ?? [];

  const renderResults = () => {
    if (search.isPending) return <Skeleton className="h-[240px] w-full" />;

    if (!search.data) {
      return (
        <Empty variant="unstyled">
          <EmptyHeader>
            <EmptyTitle>Paste a secret value, then press Enter or select Search</EmptyTitle>
            <EmptyDescription>
              Results cover every project in the organization, including ones you are not a member
              of.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (matches.length === 0) {
      return (
        <Empty variant="unstyled">
          <EmptyHeader>
            <EmptyTitle>No secret in the organization holds this value</EmptyTitle>
            <EmptyDescription>Personal overrides are not searched.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="text-sm text-muted">
          {matches.length >= SEARCH_RESULT_LIMIT
            ? `Showing the first ${SEARCH_RESULT_LIMIT} matches`
            : `${matches.length} ${matches.length === 1 ? "secret holds" : "secrets hold"} this value`}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">Project</TableHead>
                <TableHead className="w-[28%]">Secret Key</TableHead>
                <TableHead className="w-[18%]">Environment</TableHead>
                <TableHead>Path</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((match, idx) => (
                <TableRow
                  key={`${match.projectId}-${match.key}-${match.environment.slug}-${match.secretPath}-${String(idx)}`}
                  className="group/row"
                >
                  <TableCell isTruncatable className="max-w-48">
                    <div className="flex items-center gap-2">
                      <ProjectIcon className="size-3.5 shrink-0 text-muted" />
                      <span className="truncate">{match.projectName}</span>
                    </div>
                  </TableCell>
                  <TableCell isTruncatable className="max-w-60">
                    <div className="flex items-center gap-2">
                      <KeyIcon className="size-4 shrink-0 text-muted" />
                      <span className="truncate font-mono">{match.key}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info" isTruncatable className="max-w-full">
                      <span>{match.environment.name}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FolderIcon className="size-3.5 shrink-0 text-folder" />
                      <span className="truncate">{match.secretPath}</span>
                    </div>
                  </TableCell>
                  <TableCell variant="action">
                    <GoToSecretFolderButton
                      orgId={orgId}
                      projectId={match.projectId}
                      secretPath={match.secretPath}
                      environmentSlug={match.environment.slug}
                      isProjectMember={memberProjectIds.has(match.projectId)}
                      onNavigate={onClose}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pb-6">
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <div className="flex flex-1 items-center gap-2">
          {/* SecretInput rather than a password field: a masked textarea keeps the line breaks
              in a pasted multi-line value (eg a PEM key), and password managers do not offer to
              save what is pasted into it. */}
          <SecretInput
            autoFocus
            valueAlwaysHidden
            maskEachCharacter
            isVisible={isRevealed}
            containerClassName="flex-1"
            placeholder="Paste the full secret value..."
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              // Results belong to the value that was searched, not the one now in the box.
              if (search.data) search.reset();
            }}
            onKeyDown={(e) => {
              // A textarea would otherwise take Enter as a newline rather than a search.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <IconButton
            type="button"
            variant="outline"
            aria-label={isRevealed ? "Hide value" : "Show value"}
            onClick={() => setIsRevealed((prev) => !prev)}
          >
            {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
          </IconButton>
        </div>
        <Button type="submit" variant="org" isDisabled={!value} isPending={search.isPending}>
          Search
        </Button>
      </form>
      {renderResults()}
    </div>
  );
};

export const SecretValueSearchSheet = ({ orgId, isOpen, onOpenChange }: Props) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent size="workspace" className="flex flex-col overflow-hidden">
      <SheetHeader>
        <SheetTitle>Search by Secret Value</SheetTitle>
        <SheetDescription>
          Find every project, environment and path where a secret value is used. Only the full value
          matches, exactly as stored: partial values and values differing in whitespace are not
          found.
        </SheetDescription>
      </SheetHeader>
      {/* Mounted only while open, so the value and results are dropped the moment it closes. */}
      {isOpen && <SearchContent orgId={orgId} onClose={() => onOpenChange(false)} />}
    </SheetContent>
  </Sheet>
);
