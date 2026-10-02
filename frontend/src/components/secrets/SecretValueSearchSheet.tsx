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
import { useDelayedLoading } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import {
  TSearchSecretsByValueResponse,
  useSearchSecretsByValue
} from "@app/hooks/api/secretInsights";

import { GoToSecretButton } from "./GoToSecretButton";
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
  // Held in state rather than read off the mutation, so the last answer stays on screen while a
  // repeat search runs instead of blanking out and back.
  const [matches, setMatches] = useState<TSearchSecretsByValueResponse["secrets"] | null>(null);
  // Most searches return well under the delay, so the skeleton only shows for a slow one.
  const isSearchSlow = useDelayedLoading(search.isPending, { delay: 300, minDuration: 500 });
  const { data: memberProjects } = useGetUserProjects();
  const memberProjectIds = useMemo(
    () => new Set(memberProjects?.map((project) => project.id)),
    [memberProjects]
  );

  const tracking = useOrgSecretValueTracking({ orgId, enabled: true });

  if (!tracking.isReady) {
    return (
      <div className="p-4">
        <SecretValueTrackingPrompt
          tracking={tracking}
          featureName="secret value search"
          description="Enable secret value search to find every project, environment and path where a value is used."
        />
      </div>
    );
  }

  // Each search is an audited event, so it runs on submit rather than on every keystroke.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value || search.isPending) return;
    search.mutate(
      { secretValue: value },
      {
        onSuccess: (data) => setMatches(data.secrets),
        // A failed search must not leave the previous value's results looking like its answer.
        onError: () => setMatches(null)
      }
    );
  };

  const renderResults = () => {
    if (isSearchSlow) return <Skeleton className="h-[240px] w-full" />;

    if (!matches) {
      return (
        <Empty variant="unstyled">
          <EmptyHeader>
            <EmptyTitle>Paste a secret value, then press Enter to search.</EmptyTitle>
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
                    <GoToSecretButton
                      orgId={orgId}
                      projectId={match.projectId}
                      secretKey={match.key}
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
            onChange={(e) => setValue(e.target.value)}
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
        <Button type="submit" variant="org" isDisabled={!value} isPending={isSearchSlow}>
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
        <SheetTitle>Locate Secrets by Value</SheetTitle>
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
