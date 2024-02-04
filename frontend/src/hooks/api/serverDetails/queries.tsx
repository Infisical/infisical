import {useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ServerStatus } from "./types";

// cache key
const serverStatusKeys = {
  serverStatus: ["serverStatus"] as const
};

const fetchServerStatus = async () => {
  const {data} = await apiRequest.get<ServerStatus>("/api/status");
  return data;
};

export const useFetchServerStatus= () => {
  return useQuery({ queryKey: serverStatusKeys.serverStatus, queryFn: fetchServerStatus });
}