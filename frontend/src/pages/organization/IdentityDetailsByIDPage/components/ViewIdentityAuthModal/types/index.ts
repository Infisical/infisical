import { UsePopUpState } from "@app/hooks/usePopUp";

export type ViewAuthMethodProps = {
  identityId: string;
  onDelete: () => void;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan", "identityAuthMethod"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
    state?: boolean
  ) => void;
  popUp: UsePopUpState<["revokeAuthMethod", "upgradePlan", "identityAuthMethod"]>;
};
