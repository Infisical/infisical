import { useSubscription } from "@app/context";
import { useOrganization } from "@app/context";
import { Tab } from '@headlessui/react'
import { Fragment } from 'react'
import { 
    useGetOrgPlanBillingInfo,
    useGetOrgPlanTable,
    useGetOrgPlansTable
} from "@app/hooks/api";
import {
  FormControl,
  Button,
  IconButton,
  Input,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  EmptyState,
  Modal,
  ModalContent
} from "@app/components/v2";
import { usePopUp } from "@app/hooks/usePopUp";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoice, faCircleCheck, faCircleXmark, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

import { ManagePlansTable } from "./ManagePlansTable";

export const ManagePlansModal = ({
    popUp,
    handlePopUpToggle
}) => {
    const { subscription, isLoading: isSubscriptionLoading } = useSubscription();
    
    return (
        <Modal
            isOpen={popUp?.managePlan?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("managePlan", isOpen);
            }}
        >
            <ModalContent className="max-w-screen-lg" title="Infisical Cloud Plans">
                <Tab.Group>
                    <Tab.List className="border-b-2 border-mineshaft-600 max-w-screen-lg">
                        <Tab as={Fragment}>
                            {({ selected }) => (
                                <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
                                    Bill monthly
                                </button>
                            )}
                        </Tab>
                        <Tab as={Fragment}>
                            {({ selected }) => (
                                <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
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
}