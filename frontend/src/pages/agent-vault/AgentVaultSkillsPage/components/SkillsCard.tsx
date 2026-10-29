import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { CreateSkillSheet } from "@app/components/agent-vault/skills/CreateSkillSheet";
import { DeleteSkillDialog } from "@app/components/agent-vault/skills/DeleteSkillDialog";
import { downloadSkillVersion } from "@app/components/agent-vault/skills/downloadSkillVersion";
import { SkillBundleBadges } from "@app/components/agent-vault/skills/SkillBundleBadges";
import { SkillDescription } from "@app/components/agent-vault/skills/SkillDescription";
import { SkillSheet } from "@app/components/agent-vault/skills/SkillSheet";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  RowLink,
  Skeleton,
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
import {
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  agentVaultKeys,
  fetchAgentVaultSkillVersion,
  useListAgentVaultSkills
} from "@app/hooks/api/agentVault";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

export const SkillsCard = () => {
  const { openSheet } = useAgentVaultSheetState("skillId");
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const { permission } = useProjectPermission();
  const canCreate = permission.can(
    ProjectPermissionAgentVaultSkillActions.Create,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canEdit = permission.can(
    ProjectPermissionAgentVaultSkillActions.Edit,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canDelete = permission.can(
    ProjectPermissionAgentVaultSkillActions.Delete,
    ProjectPermissionSub.AgentVaultSkills
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultSkillsTable", PreferenceKey.PerPage, 20)
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<TAgentVaultSkill | null>(null);

  const searchTerm = debouncedSearch.trim();

  // The page goes back to 1 in the same render the debounced search lands in, as on the variables page.
  const [pagedSearchTerm, setPagedSearchTerm] = useState(searchTerm);
  if (pagedSearchTerm !== searchTerm) {
    setPagedSearchTerm(searchTerm);
    setPage(1);
  }
  const { data, isPending } = useListAgentVaultSkills({
    search: searchTerm || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const displayed = data?.skills ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });
  const hasSkills = totalCount > 0 || Boolean(searchTerm);

  const openSkill = (skill: Pick<TAgentVaultSkill, "id">) => openSheet(skill.id);

  const downloadSkill = async (skill: TAgentVaultSkill) => {
    try {
      const version = await queryClient.fetchQuery({
        queryKey: agentVaultKeys.skillVersion(currentOrg.id, skill.id, skill.latestVersion),
        queryFn: () => fetchAgentVaultSkillVersion(skill.id, skill.latestVersion),
        staleTime: Infinity
      });
      downloadSkillVersion(skill.name, version);
    } catch {
      createNotification({ text: `Couldn't download "${skill.name}". Try again.`, type: "error" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Skills
          <DocumentationLinkBadge href={AgentVaultDocsUrls.skills} />
        </CardTitle>
        <CardDescription>
          A skill is a folder of instructions agents load when a task calls for it, delivered
          through the access bundles you add it to.
        </CardDescription>
        {canCreate && (
          <CardAction>
            <Button variant="av" onClick={() => setIsCreateOpen(true)}>
              <PlusIcon />
              Create Skill
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {hasSkills && (
        <CardContent>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills..."
            />
          </InputGroup>
        </CardContent>
      )}

      {!isPending && displayed.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{hasSkills ? "No skills match your search" : "No skills yet"}</EmptyTitle>
              <EmptyDescription>
                {hasSkills
                  ? "Try a different search term."
                  : "Create or upload a skill, or push one with the Infisical CLI."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-1/4">
                Name
              </TableHead>
              <TableHead isTruncatable className="w-2/5">
                Description
              </TableHead>
              <TableHead className="w-1/4">Access Bundles</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 3 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`skill-skeleton-${index}`}>
                  {Array.from({ length: 4 }).map((__, cell) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={`skill-skeleton-${index}-${cell}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              displayed.map((skill) => (
                <TableRow key={skill.id} linked>
                  <TableCell isTruncatable>
                    <RowLink
                      to="/organizations/$orgId/agent-vault/skills"
                      params={{ orgId: currentOrg.id }}
                      search={{ skillId: skill.id }}
                      title={skill.name}
                    >
                      {skill.name}
                    </RowLink>
                  </TableCell>
                  <TableCell isTruncatable>
                    <SkillDescription description={skill.description} />
                  </TableCell>
                  <TableCell>
                    <SkillBundleBadges accessBundles={skill.accessBundles} />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm">
                          {format(new Date(skill.updatedAt), "MMM d, yyyy")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(skill.updatedAt), "MMM d, yyyy h:mm a")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell variant="action">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label="Open skill actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        sideOffset={2}
                        align="end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openSkill(skill)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => downloadSkill(skill)}>
                          <DownloadIcon />
                          Download
                        </DropdownMenuItem>
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="danger"
                              onClick={() => setSkillToDelete(skill)}
                            >
                              <TrashIcon />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      {totalCount > 0 && (
        <CardContent className="-mt-5 pt-0">
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(newPerPage) => {
              setPerPage(newPerPage);
              setPage(1);
              setUserTablePreference("agentVaultSkillsTable", PreferenceKey.PerPage, newPerPage);
            }}
          />
        </CardContent>
      )}

      <CreateSkillSheet
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(skill) => openSkill(skill)}
      />

      <SkillSheet />

      <DeleteSkillDialog
        skill={skillToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSkillToDelete(null);
        }}
      />
    </Card>
  );
};
