import { faBorderAll, faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { PamAccountView } from "@app/hooks/api/pam";

type Props = {
  value: PamAccountView;
  onChange: (value: PamAccountView) => void;
};

export const AccountViewToggle = ({ value, onChange }: Props) => {
  return (
    <div className="flex gap-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <IconButton
        variant="outline_bg"
        onClick={() => {
          onChange(PamAccountView.Flat);
        }}
        ariaLabel="grid"
        size="xs"
        className={`${
          value === PamAccountView.Flat ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        <FontAwesomeIcon icon={faBorderAll} />
      </IconButton>
      <IconButton
        variant="outline_bg"
        onClick={() => {
          onChange(PamAccountView.Nested);
        }}
        ariaLabel="list"
        size="xs"
        className={`${
          value === PamAccountView.Nested ? "bg-mineshaft-500" : "bg-transparent"
        } min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600`}
      >
        <FontAwesomeIcon icon={faList} />
      </IconButton>
    </div>
  );
};
