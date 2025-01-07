import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCreateUserWishDto } from "./types";

export const useCreateUserWish = () => {
  return useMutation<object, object, TCreateUserWishDto>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/user-engagement/me/wish", dto);
      return data;
    }
  });
};
