import { useState } from "react";
import type { ErrorStateDetail } from "@infisical/cipher/patterns/error-state";
import { useParams } from "@tanstack/react-router";
import { AxiosError } from "axios";

import { orgHref } from "./links";

export const useErrorContext = (error?: unknown) => {
  const { orgId, projectId } = useParams({ strict: false });
  const [time] = useState(() => `${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`);
  const axios = error instanceof AxiosError ? error : undefined;
  const status = axios ? (axios.status ?? axios.response?.status) : undefined;
  const reqId =
    typeof axios?.response?.data?.reqId === "string" ? axios.response.data.reqId : undefined;
  const details: ErrorStateDetail[] = [
    ...(reqId ? [{ label: "request", value: reqId }] : []),
    ...(status ? [{ label: "status", value: String(status) }] : []),
    { label: "route", value: window.location.pathname },
    { label: "time", value: time }
  ];
  return {
    status,
    projectAccessDenied:
      status === 403 && axios?.response?.data?.error === "ProjectMembershipNotFound",
    details,
    projectId,
    homeHref: orgId ? orgHref(orgId) : undefined
  };
};
