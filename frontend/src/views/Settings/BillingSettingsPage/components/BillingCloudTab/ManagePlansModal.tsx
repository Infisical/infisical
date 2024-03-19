import { Fragment } from "react";
import { Tab } from "@headlessui/react";

import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ManagePlansTable } from "./ManagePlansTable";

type Props = {
  popUp: UsePopUpState<["managePlan"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["managePlan"]>, state?: boolean) => void;
};

export const ManagePlansModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.managePlan?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("managePlan", isOpen);
      }}
    >
      <ModalContent className="max-w-screen-lg" title="Infisical Cloud Plans">
        <Tab.Group>
          <Tab.List className="max-w-screen-lg border-b-2 border-mineshaft-600">
            <Tab as={Fragment}>
              {({ selected }) => (
                <button
                  type="button"
                  className={`p-4 ${
                    selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"
                  } w-30 font-semibold outline-none`}
                >
                  Bill monthly
                </button>
              )}
            </Tab>
            <Tab as={Fragment}>
              {({ selected }) => (
                <button
                  type="button"
                  className={`p-4 ${
                    selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"
                  } w-30 font-semibold outline-none`}
                >
                  Bill yearly
                </button>
              )}
            </Tab>
          </Tab.List>
          <Tab.Panels className="mt-4">
            <Tab.Panel>
              <ManagePlansTable billingCycle="monthly" />
            </Tab.Panel>
            <Tab.Panel>
              <ManagePlansTable billingCycle="yearly" />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </ModalContent>
    </Modal>
  );
};
