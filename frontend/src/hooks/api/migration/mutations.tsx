import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiRequest } from "@app/config/request";

export const useImportEnvKey = () => {
    return useMutation({
        mutationFn: async ({ encryptedJson, decryptionKey }: { encryptedJson: {
            nonce: string,
            data: string
        }, decryptionKey: string }) : Promise<{ success: boolean, message:string }>=> {
            try{
                const { data } = await apiRequest.post<{
                    success: boolean,
                    message: string
                }>("/api/v3/migrate/envkey/", {
                    encryptedJson,
                    decryptionKey
                });
                return data;
            } catch (err) {
                if ((err as AxiosError<{
                    message: string
                }>).response) {
                    return { success: false, message: (err as AxiosError<{message: string}>).response?.data?.message as string};
                }
            }
            return { success: false, message: "Something went wrong" };
        }
    });
};