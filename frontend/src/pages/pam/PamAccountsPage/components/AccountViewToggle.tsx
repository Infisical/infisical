import { Button } from "@app/components/v2";
import { PamAccountView } from "@app/hooks/api/pam";

type Props = {
  value: PamAccountView;
  onChange: (value: PamAccountView) => void;
};

export const AccountViewToggle = ({ value, onChange }: Props) => {
  return (
    <div className="flex gap-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(PamAccountView.Flat);
        }}
        size="xs"
        className={`${
          value === PamAccountView.Flat ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Hide Folders
      </Button>
      <Button
        variant="outline_bg"
        onClick={() => {
          onChange(PamAccountView.Nested);
        }}
        size="xs"
        className={`${
          value === PamAccountView.Nested ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        Show Folders
      </Button>
    </div>
  );
};
