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
    <div className="border-mineshaft-600 bg-mineshaft-800 flex gap-0.5 rounded-md border p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(AccountView.Flat);
        }}
        size="xs"
        className={`${
          value === AccountView.Flat ? "bg-mineshaft-500" : "bg-transparent"
        } hover:bg-mineshaft-600 min-w-[2.4rem] rounded border-none`}
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
        } hover:bg-mineshaft-600 min-w-[2.4rem] rounded border-none`}
      >
        Show Folders
      </Button>
    </div>
  );
};
