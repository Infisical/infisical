import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { TCertificate } from "./types";

export type TDeleteCaDTO = {
  projectSlug: string;
  certId: string;
};

export const useDeleteCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificate, {}, TDeleteCaDTO>({
    mutationFn: async ({ certId }) => {
      const {
        data: { certificate }
      } = await apiRequest.delete<{ certificate: TCertificate }>(`/api/v1/certificates/${certId}`);
      return certificate;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificates(projectSlug));
    }
  });
};
