import { FolderPlusIcon, LayersIcon, PlusIcon, SearchIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

type Props = {
  isFiltered?: boolean;
  variant?: "secrets" | "no-environments";
  onAddEnvironment?: () => void;
};

export function EmptyResourceDisplay({ isFiltered, variant = "secrets", onAddEnvironment }: Props) {
  if (variant === "no-environments") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayersIcon />
          </EmptyMedia>
          <EmptyTitle>No environments yet</EmptyTitle>
          <EmptyDescription>
            Environments isolate secrets by stage. Add one to start managing secrets for this
            project.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Environments}
          >
            {(isAllowed) => (
              <Button size="xs" isDisabled={!isAllowed} onClick={onAddEnvironment}>
                <PlusIcon />
                Add Environment
              </Button>
            )}
          </ProjectPermissionCan>
        </EmptyContent>
      </Empty>
    );
  }

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
