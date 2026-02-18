import { FolderPlusIcon, SearchIcon } from "lucide-react";

import {
  EmptyMedia,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";

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
    <UnstableEmpty className="border">
      <UnstableEmptyHeader>
        <EmptyMedia variant="icon">{isFiltered ? <SearchIcon /> : <FolderPlusIcon />}</EmptyMedia>
        <UnstableEmptyTitle>{title}</UnstableEmptyTitle>
        <UnstableEmptyDescription>{description}</UnstableEmptyDescription>
      </UnstableEmptyHeader>
    </UnstableEmpty>
  );
}
