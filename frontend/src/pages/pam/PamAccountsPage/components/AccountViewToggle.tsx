import { Button } from "@app/components/v2";

export enum AccountView {
  Flat = "flat",
  Nested = "nested"
}

type Props = {
  value: AccountView;
  onChange: (value: AccountView) => void;
};

export const AccountViewToggle = ({ value, onChange }: Props) => {
  return (
    <div className="flex gap-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(AccountView.Flat);
        }}
        size="xs"
        className={`${
          value === AccountView.Flat ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Hide Folders
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(AccountView.Nested);
        }}
        size="xs"
        className={`${
          value === AccountView.Nested ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Show Folders
      </Button>
    </div>
  );
};
