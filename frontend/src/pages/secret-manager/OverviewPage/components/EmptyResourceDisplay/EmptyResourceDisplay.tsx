import { FolderPlusIcon, PlusIcon, SearchIcon } from "lucide-react";

import {
  Button,
  EmptyMedia,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";

type Props = {
  isFiltered?: boolean;
  onAddSecret?: () => void;
};

export function EmptyResourceDisplay({ isFiltered, onAddSecret }: Props) {
  const { title, description } = isFiltered
    ? {
        title: "No resources match your search",
        description: "Add a secret now"
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
      <UnstableEmptyContent className="flex-row justify-center">
        <Button onClick={onAddSecret} variant="project">
          <PlusIcon />
          Add Secret
        </Button>
      </UnstableEmptyContent>
    </UnstableEmpty>
  );
}
