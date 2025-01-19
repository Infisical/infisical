import { apiRequest } from "@app/config/request";
import { ConsumerSecretRaw, decodeConsumerSecret } from "./models";
import { useQueryClient } from "@tanstack/react-query";
import { ConsumerSecretsQueryKey, FormState } from "./ConsumerSecretsPage";

export function ConsumerSecretItem({ consumerSecretRaw, formState }: { consumerSecretRaw: ConsumerSecretRaw, formState: FormState }) {
    const content = decodeConsumerSecret(consumerSecretRaw.plaintextSecret);

    const queryClient = useQueryClient();

    const renderContent = (() => {
        switch (content.kind) {
            case "SecureNote":
                return <>Title: {content.title}. Content: {content.content}</>
            default:
                throw new Error("Other secret kinds not implemented");
        }
    })()


    return <>
        <button onClick={() =>
            apiRequest
                .delete(`api/v3/consumersecrets/delete/${consumerSecretRaw.id}`)
                .then(() => queryClient.invalidateQueries({ queryKey: ConsumerSecretsQueryKey }))
        }> [delete] </button>

        <button onClick={() => {
            formState.setSecretId(consumerSecretRaw.id);

            if (content.kind === "SecureNote") {
                formState.setTitle(content.title);
                formState.setContent(content.content);
            } else {
                throw new Error("Other secret kinds not implemented")
            }
        }}> [edit] </button>

        {renderContent}</>
}