import { Button } from "@app/components/v2";

export enum NamespaceListView {
  MyNamespaces = "my-namespaces",
  AllNamespaces = "all-namespaces"
}

type Props = {
  value: NamespaceListView;
  onChange: (value: NamespaceListView) => void;
};

export const NamespaceListToggle = ({ value, onChange }: Props) => {
  return (
    <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(NamespaceListView.MyNamespaces);
        }}
        size="xs"
        className={`${
          value === NamespaceListView.MyNamespaces ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        My Namespaces
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(NamespaceListView.AllNamespaces);
        }}
        size="xs"
        className={`${
          value === NamespaceListView.AllNamespaces ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        All Namespaces
      </Button>
    </div>
  );
};
