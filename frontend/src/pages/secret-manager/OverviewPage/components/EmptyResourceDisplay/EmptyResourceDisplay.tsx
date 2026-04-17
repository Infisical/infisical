import { FolderPlusIcon, SearchIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@app/components/v3";

type Props = {
  isFiltered?: boolean;
};

export function EmptyResourceDisplay({ isFiltered }: Props) {
  const { title, description } = isFiltered
    ? {
        title: "No resources match your search",
        description: "Adjust your search and try again"
      }
    : {
        title: "This project doesn't have any secrets",
        description: "Add some secrets to get started"
      };

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{isFiltered ? <SearchIcon /> : <FolderPlusIcon />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
