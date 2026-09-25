import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowRightIcon, FolderIcon, KeyIcon, LayersIcon, LockIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  IconButton,
  ProjectIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { TOrgDuplicatedSecretGroup } from "@app/hooks/api/secretInsights";

const overviewRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;

type Props = {
  groups: TOrgDuplicatedSecretGroup[];
};

const pluralize = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const DuplicateGroupList = ({ groups }: Props) => {
  const { orgId } = useParams({ strict: false });
  const navigate = useNavigate();

  return (
    <Accordion type="multiple">
      {groups.map((group, groupIdx) => {
        const isCrossProject = group.projectCount > 1;

        return (
          <AccordionItem
            key={`group-${String(groupIdx)}`}
            value={`group-${String(groupIdx)}`}
            className={cn(isCrossProject && "border-l-2 border-l-org")}
          >
            <AccordionTrigger>
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-2">
                  <LockIcon className="size-3.5 text-muted" />
                  <span className="text-sm text-foreground">
                    <span className="font-medium">{group.secrets.length} secrets</span> share an
                    identical value
                  </span>
                </div>
                <Badge
                  variant={isCrossProject ? "org" : "neutral"}
                  className="flex items-center gap-1.5 font-normal"
                >
                  <LayersIcon className="size-3" />
                  {isCrossProject
                    ? `${pluralize(group.projectCount, "project")} · ${pluralize(group.locationCount, "location")}`
                    : pluralize(group.locationCount, "location")}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="group-data-[variant=default]/accordion:p-0">
              <Table containerClassName="rounded-t-none overflow-x-hidden">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[22%]">Project</TableHead>
                    <TableHead className="w-[28%]">Secret Key</TableHead>
                    <TableHead className="w-[20%]">Environment</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead variant="action" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.secrets.map((entry, idx) => (
                    <TableRow
                      key={`${entry.projectId}-${entry.key}-${entry.environment.slug}-${entry.secretPath}-${String(idx)}`}
                      className="group/row"
                    >
                      <TableCell isTruncatable className="max-w-48">
                        <div className="flex items-center gap-2">
                          <ProjectIcon className="size-3.5 shrink-0 text-muted" />
                          <span className="truncate">{entry.projectName}</span>
                        </div>
                      </TableCell>
                      <TableCell isTruncatable className="max-w-60">
                        <div className="flex items-center gap-2">
                          <KeyIcon className="size-4 shrink-0 text-muted" />
                          <span className="truncate font-mono">{entry.key}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="info" isTruncatable className="max-w-full">
                          <span>{entry.environment.name}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FolderIcon className="size-3.5 shrink-0 text-folder" />
                          <span className="truncate">{entry.secretPath}</span>
                        </div>
                      </TableCell>
                      <TableCell variant="action">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="sm"
                                aria-label="Go to secret folder"
                                className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                                onClick={() =>
                                  navigate({
                                    to: overviewRoute,
                                    params: {
                                      orgId: orgId as string,
                                      projectId: entry.projectId
                                    },
                                    search: {
                                      secretPath: entry.secretPath,
                                      environments: [entry.environment.slug]
                                    }
                                  })
                                }
                              >
                                <ArrowRightIcon className="size-3.5" />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>Go to secret folder</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};
