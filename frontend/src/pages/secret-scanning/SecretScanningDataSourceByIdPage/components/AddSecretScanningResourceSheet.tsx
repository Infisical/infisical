import { useMemo, useState } from "react";
import { FolderGitIcon, SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton
} from "@app/components/v3";
import {
  getAddedResourceScanDescription,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  TSecretScanningDataSource,
  useAddSecretScanningResource,
  useListSecretScanningAvailableResources
} from "@app/hooks/api/secretScanningV2";

type Props = {
  dataSource: TSecretScanningDataSource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddSecretScanningResourceSheet = ({ dataSource, isOpen, onOpenChange }: Props) => {
  const [search, setSearch] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);

  const { data: resources = [], isPending } = useListSecretScanningAvailableResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    { enabled: isOpen }
  );

  const addResource = useAddSecretScanningResource();

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type];

  const availableResources = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return resources.filter(
      ({ name, isIncluded }) => !isIncluded && name.toLowerCase().includes(searchValue)
    );
  }, [resources, search]);

  const hasExcludedResources = resources.some(({ isIncluded }) => !isIncluded);

  const handleEnableScanning = async (resourceName: string) => {
    setPendingName(resourceName);
    try {
      await addResource.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId,
        resourceName
      });
    } finally {
      setPendingName(null);
    }

    createNotification({
      text: `Added "${resourceName}". ${getAddedResourceScanDescription(dataSource)}`,
      type: "success"
    });
  };

  const renderList = () => {
    if (isPending) {
      return (
        <ItemGroup className="gap-2">
          {["first", "second", "third"].map((row) => (
            <Skeleton key={`available-resource-skeleton-${row}`} className="h-12 w-full" />
          ))}
        </ItemGroup>
      );
    }

    if (!availableResources.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasExcludedResources ? <SearchIcon /> : <FolderGitIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {hasExcludedResources
                ? `No ${resourceDetails.pluralNoun} match your search`
                : `No ${resourceDetails.pluralNoun} left to add`}
            </EmptyTitle>
            <EmptyDescription>
              {hasExcludedResources
                ? "Try a different search term."
                : `Every ${resourceDetails.singularNoun} this connection can access is already being scanned. Don't see one? Check that the App Connection has access to it in ${platform}.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <ItemGroup className="gap-2">
        {availableResources.map(({ externalId, name }) => (
          <Item key={externalId} variant="outline" size="sm">
            <ItemContent className="min-w-0">
              <ItemTitle className="truncate">{name}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="xs"
                isPending={pendingName === name}
                isDisabled={Boolean(pendingName)}
                onClick={() => handleEnableScanning(name)}
              >
                Enable Scanning
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    );
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setSearch("");
        onOpenChange(open);
      }}
    >
      <SheetContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Add {resourceDetails.singularTitle}</SheetTitle>
          <SheetDescription>
            Enable scanning for a {resourceDetails.singularNoun} from {dataSource.name}.
            {dataSource.isHistoricalScanEnabled &&
              " Its full history is scanned as soon as it's added."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${resourceDetails.pluralNoun}...`}
            />
          </InputGroup>
          {renderList()}
        </div>
        <SheetFooter className="justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
