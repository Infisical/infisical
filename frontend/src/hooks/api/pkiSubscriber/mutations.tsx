import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCreateCertificateResponse } from "../ca/types";
import { workspaceKeys } from "../workspace/query-keys";
import { pkiSubscriberKeys } from "./queries";
import {
  TCreatePkiSubscriberDTO,
  TDeletePkiSubscriberDTO,
  TIssuePkiSubscriberCertDTO,
  TPkiSubscriber,
  TUpdatePkiSubscriberDTO
} from "./types";

export const useCreatePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TCreatePkiSubscriberDTO>({
    mutationFn: async (body) => {
      const { data: subscriber } = await apiRequest.post("/api/v1/pki/subscribers", body);
      return subscriber;
    },
    onSuccess: ({ projectId, name }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name,
          projectId
        })
      });
    }
  });
};

export const useUpdatePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TUpdatePkiSubscriberDTO>({
    mutationFn: async ({ subscriberName, ...body }) => {
      const { data: subscriber } = await apiRequest.patch(
        `/api/v1/pki/subscribers/${subscriberName}`,
        body
      );
      return subscriber;
    },
    onSuccess: ({ projectId, name }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name,
          projectId
        })
      });
    }
  });
};

export const useDeletePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TDeletePkiSubscriberDTO>({
    mutationFn: async ({ subscriberName, projectId }) => {
      const { data: subscriber } = await apiRequest.delete(
        `/api/v1/pki/subscribers/${subscriberName}`,
        {
          data: {
            projectId
          }
        }
      );
      return subscriber;
    },
    onSuccess: ({ name, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name,
          projectId
        })
      });
    }
  });
};

export const useIssuePkiSubscriberCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCreateCertificateResponse, object, TIssuePkiSubscriberCertDTO>({
    mutationFn: async ({ subscriberName, projectId }) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/subscribers/${subscriberName}/issue-certificate`,
        {
          projectId
        }
      );
      return data;
    },
    onSuccess: (_, { subscriberName, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.forPkiSubscriberCertificates({
          subscriberName,
          projectId
        })
      });
    }
  });
};
