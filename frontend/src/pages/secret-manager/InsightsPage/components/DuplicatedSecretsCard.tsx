import { ArrowRightIcon, CopyIcon, FolderIcon, LinkIcon, LockIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetSecretsDuplication } from "@app/hooks/api/secretInsights";

const ENVIRONMENT_COLOR_MAP: Record<string, string> = {
  production: "bg-green-500",
  staging: "bg-yellow-500",
  development: "bg-emerald-400",
  testing: "bg-blue-400"
};

const getEnvironmentDotColor = (slug: string) => {
  return ENVIRONMENT_COLOR_MAP[slug] || "bg-primary";
};

export const DuplicatedSecretsCard = () => {
  const { projectId } = useProject();

  const { data, isPending } = useGetSecretsDuplication(
    { projectId },
    { enabled: !!projectId }
  );

  const groups = data?.groups ?? [];
  const secretBlindIndexEnabled = data?.secretBlindIndexEnabled ?? true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicated Secrets</CardTitle>
        <CardDescription>
          Secrets across environments and paths that resolve to the same value. Reuse increases
          blast radius &mdash; consider referencing a single source instead of copying.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-[280px] w-full" />}
        {!isPending && !secretBlindIndexEnabled && (
          <div className="flex h-[200px] items-center justify-center">
            <Button variant="outline">Enable Secret Duplication Detection</Button>
          </div>
        )}
        {!isPending && secretBlindIndexEnabled && groups.length === 0 && (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-muted">No duplicated secrets found</p>
          </div>
        )}
        {!isPending && secretBlindIndexEnabled && groups.length > 0 && (
          <Accordion type="multiple">
            {groups.map((group, groupIdx) => (
              <AccordionItem key={`group-${String(groupIdx)}`} value={`group-${String(groupIdx)}`}>
                <AccordionTrigger>
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LockIcon className="size-3.5 text-muted" />
                      <span className="text-sm text-foreground">
                        <span className="font-medium">{group.secrets.length} secrets</span> share
                        an identical value
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {group.secrets.length > 0 ? (
                    <div className="flex flex-col">
                      {group.secrets.map((entry, idx) => (
                        <div
                          key={`${entry.key}-${entry.environment}-${entry.secretPath}-${String(idx)}`}
                          className="group/row -mx-2 flex items-center gap-6 rounded-md px-2 py-1.5 text-sm hover:bg-container-hover"
                        >
                          <div className="flex w-48 shrink-0 items-center gap-2">
                            <LinkIcon className="size-3.5 text-muted" />
                            <span className="truncate font-mono text-foreground">{entry.key}</span>
                          </div>
                          <div className="flex w-28 shrink-0 items-center gap-2">
                            <span
                              className={`size-2 shrink-0 rounded-full ${getEnvironmentDotColor(entry.environment)}`}
                            />
                            <span className="truncate text-foreground">{entry.environment}</span>
                          </div>
                          <div className="flex min-w-0 flex-1 items-center gap-2 text-muted">
                            <FolderIcon className="size-3.5 shrink-0" />
                            <span className="truncate">{entry.secretPath}</span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Go to secret"
                                  className="opacity-0 transition-opacity group-hover/row:opacity-100"
                                >
                                  <ArrowRightIcon className="size-3.5" />
                                </IconButton>
                              </TooltipTrigger>
                              <TooltipContent>Go to secret</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <CopyIcon className="mr-2 size-4 text-muted" />
                      <span className="text-sm text-muted">Expand to view duplicated secrets</span>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};
