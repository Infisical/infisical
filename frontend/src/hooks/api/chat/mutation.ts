import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const useCreateChat = () => {
  return useMutation({
    mutationFn: async (data: {
      message: string;
      conversationId?: string;
      documentationLink: string;
    }) => {
      const response = await apiRequest.post<{
        conversationId: string;
        message: string;
        citations: { title: string; url: string }[];
      }>("/api/v1/chat", data);
      return response.data;
    }
  });
};
