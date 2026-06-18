import { useMemo, useState } from "react";
import { faCircleInfo, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { TProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

import { DeleteProjectTemplateModal } from "./DeleteProjectTemplateModal";

type Props = {
  onEdit: (projectTemplate: TProjectTemplate) => void;
};

const skeletonRowIds = [
  "template-skeleton-1",
  "template-skeleton-2",
  "template-skeleton-3",
  "template-skeleton-4",
  "template-skeleton-5"
];

const tableColumnKeys = ["name", "roles", "users", "groups", "identities", "actions"];

export const ProjectTemplatesTable = ({ onEdit }: Props) => {
  const { subscription } = useSubscription();

  const { isPending, data: projectTemplates = [] } = useListProjectTemplates({
    enabled: subscription?.projectTemplates
  });

  const [search, setSearch] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteTemplate"] as const);

  const filteredTemplates = useMemo(
    () =>
      projectTemplates?.filter(
        (template) =>
          template.name !== "default" &&
          template.name.toLowerCase().includes(search.toLowerCase().trim())
      ) ?? [],
    [search, projectTemplates]
  );

  const colSpan = tableColumnKeys.length;

  return (
    <div>
      <InputGroup>
        <InputGroupAddon>
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
        />
      </InputGroup>
      <Table containerClassName="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>Groups</TableHead>
            <TableHead>Machine Identities</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscription?.projectTemplates &&
            isPending &&
            skeletonRowIds.map((rowId) => (
              <TableRow key={rowId}>
                {tableColumnKeys.map((columnKey) => (
                  <TableCell key={`${rowId}-${columnKey}`}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {filteredTemplates.map((template) => {
            const {
              id,
              name,
              roles,
              description,
              users,
              groups,
              identities,
              projectManagedIdentities
            } = template;

            const totalIdentities =
              (identities?.length || 0) + (projectManagedIdentities?.length || 0);

            return (
              <TableRow
                onClick={() => onEdit(template)}
                className="cursor-pointer hover:bg-mineshaft-700"
                key={id}
              >
                <TableCell>
                  {name}
                  {description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{description}</TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="pl-8">
                  {roles.length}
                  {roles.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <ul className="ml-2 list-disc">
                          {roles.map((role) => (
                            <li key={role.name}>{role.name}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="pl-8">
                  {users?.length || 0}
                  {users && Boolean(users.length) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <ul className="ml-2 list-disc">
                          {users.map((user) => (
                            <li key={user.username}>{user.username}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="pl-8">
                  {groups?.length || 0}
                  {groups && Boolean(groups.length) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <ul className="ml-2 list-disc">
                          {groups.map((group) => (
                            <li key={group.groupSlug}>{group.groupSlug}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="pl-8">
                  {totalIdentities}
                  {Boolean(totalIdentities) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FontAwesomeIcon
                          size="sm"
                          className="ml-2 text-mineshaft-400"
                          icon={faCircleInfo}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <ul className="ml-2 list-disc">
                          {(projectManagedIdentities || []).map((identity) => (
                            <li key={identity.name}>{identity.name}</li>
                          ))}
                          {identities && Boolean(identities?.length) && (
                            <li key="org">
                              {identities.length} Organization Identit
                              {identities.length === 1 ? "y" : "ies"}
                            </li>
                          )}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="w-5">
                  {name !== "default" && (
                    <OrgPermissionCan
                      I={OrgPermissionActions.Delete}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopUpOpen("deleteTemplate", template);
                          }}
                          variant="ghost"
                          aria-label="Delete template"
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {(!subscription?.projectTemplates || (!isPending && filteredTemplates?.length === 0)) && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colSpan} className="p-0">
                <Empty className="h-28 rounded-none border-0 shadow-none">
                  <EmptyHeader>
                    <EmptyTitle>
                      {search.trim()
                        ? "No project templates match search"
                        : "No project templates found"}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <DeleteProjectTemplateModal
        isOpen={popUp.deleteTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
        template={popUp.deleteTemplate.data}
      />
    </div>
  );
};
