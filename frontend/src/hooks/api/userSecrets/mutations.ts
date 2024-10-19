import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TUpdateCredentialRequest } from "./types";



export const useUpdateCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputData: TUpdateCredentialRequest) => {
      // Simulating a local storage save operation
      const credentials = JSON.parse(localStorage.getItem("credentials") || "[]");

      // Find the credential to update
      const updatedCredentials = credentials.map((credential: any) =>
        credential.id === inputData.id ? { ...credential, ...inputData } : credential
      );

      // Save updated credentials back to local storage
      localStorage.setItem("credentials", JSON.stringify(updatedCredentials));

      return updatedCredentials;
    },
    onSuccess: () => {
      // Invalidate queries related to credentials to refetch any updates
      queryClient.invalidateQueries("credentials");
    }
  });
};
