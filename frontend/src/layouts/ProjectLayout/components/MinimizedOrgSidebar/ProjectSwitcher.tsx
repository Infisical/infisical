import { useState } from "react";
import { faExternalLink, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { DropdownMenuItem, EmptyState, Input } from "@app/components/v2";
import { getProjectTitle } from "@app/helpers/project";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";

type Props = {
  type: ProjectType;
};

export const ProjectSwitcher = ({ type }: Props) => {
  const { data: workspaces, isPending } = useGetUserWorkspaces({ type });
  const [search, setSearch] = useState("");

  const filteredWorkspaces = workspaces?.filter((el) =>
    el.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Link to={`/organization/${type}/overview` as const}>
        <div className="py-2 text-xs capitalize text-bunker-300">
          {getProjectTitle(type)} projects
          <FontAwesomeIcon icon={faExternalLink} size="xs" className="ml-1" />
        </div>
      </Link>
      <div className="w-full pb-2">
        <Input
          leftIcon={<FontAwesomeIcon icon={faSearch} />}
          value={search}
          onChange={(evt) => setSearch(evt.target.value)}
          size="xs"
          placeholder="Search by name"
          className=""
        />
      </div>
      <div className="thin-scrollbar max-h-64 overflow-auto">
        {filteredWorkspaces?.map((el) => (
          <Link
            to={`/${type}/$projectId/overview` as const}
            params={{ projectId: el.id }}
            key={el.id}
          >
            <DropdownMenuItem>
              <span className="capitalize">{el.name}</span>
            </DropdownMenuItem>
          </Link>
        ))}
        {!isPending && !filteredWorkspaces?.length && (
          <EmptyState title="No project found" iconSize="1x" />
        )}
      </div>
    </>
  );
};
