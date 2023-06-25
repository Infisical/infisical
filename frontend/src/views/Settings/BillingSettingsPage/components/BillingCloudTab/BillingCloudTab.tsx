import { useTranslation } from "react-i18next";
import Head from "next/head";
import Plan from "@app/components/billing/Plan";
import NavHeader from "@app/components/navigation/NavHeader";
import {
  Input,
  Button,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMagnifyingGlass, faDownload } from "@fortawesome/free-solid-svg-icons";

import { PreviewSection } from "./PreviewSection";
import { CurrentPlanSection } from "./CurrentPlanSection";

// TODO: optimize + modularize
// TODO: get cloud plan full

export const BillingCloudTab = () => {
    return (
        <div>
            <PreviewSection />
            <CurrentPlanSection />
        </div>
    );
}