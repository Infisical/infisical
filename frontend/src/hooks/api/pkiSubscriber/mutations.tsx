import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCreateCertificateResponse } from "../ca/types";
import { projectKeys } from "../projects/query-keys";
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
        queryKey: projectKeys.getProjectPkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name
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
        queryKey: projectKeys.getProjectPkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name
        })
      });
    }
  });
};

export const useDeletePkiSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiSubscriber, object, TDeletePkiSubscriberDTO>({
    mutationFn: async ({ subscriberName }) => {
      const { data: subscriber } = await apiRequest.delete(
        `/api/v1/pki/subscribers/${subscriberName}`
      );
      return subscriber;
    },
    onSuccess: ({ name, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectPkiSubscribers(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.getPkiSubscriber({
          subscriberName: name
        })
      });
    }
  });
};

export const useIssuePkiSubscriberCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCreateCertificateResponse, object, TIssuePkiSubscriberCertDTO>({
    mutationFn: async ({ subscriberName }) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/subscribers/${subscriberName}/issue-certificate`,
        {}
      );
      return data;
    },
    onSuccess: (_, { subscriberName }) => {
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.forPkiSubscriberCertificates({
          subscriberName
        })
      });
    }
  });
};

export const useOrderPkiSubscriberCert = () => {
  return useMutation<{ message: string }, object, TIssuePkiSubscriberCertDTO>({
    mutationFn: async ({ subscriberName }) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/subscribers/${subscriberName}/order-certificate`,
        {}
      );
      return data;
    }
  });
};
