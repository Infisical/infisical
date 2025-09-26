import { Button } from "@app/components/v2";

export enum ResourceListView {
  MyResource = "my-resource",
  AllResources = "all-resource"
}

export enum ResourceViewMode {
  GRID = "grid",
  LIST = "list"
}

type Props = {
  value: ResourceListView;
  onChange: (value: ResourceListView) => void;
  resourceName?: string;
};

export const ResourceListToggle = ({ value, onChange, resourceName = "Projects" }: Props) => {
  return (
    <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(ResourceListView.MyResource);
        }}
        size="xs"
        className={`${
          value === ResourceListView.MyResource ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        My {resourceName}
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(ResourceListView.AllResources);
        }}
        size="xs"
        className={`${
          value === ResourceListView.AllResources ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        All {resourceName}
      </Button>
    </div>
  );
};
