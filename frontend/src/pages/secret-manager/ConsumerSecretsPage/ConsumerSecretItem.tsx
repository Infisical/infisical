import { apiRequest } from "@app/config/request";
import { ConsumerSecretRaw, decodeConsumerSecret } from "./models";
import { useQueryClient } from "@tanstack/react-query";
import { ConsumerSecretsQueryKey } from "./ConsumerSecretsPage";

export function ConsumerSecretItem({ consumerSecretRaw }: { consumerSecretRaw: ConsumerSecretRaw }) {
    const content = decodeConsumerSecret(consumerSecretRaw.plaintextSecret);

    const queryClient = useQueryClient();

    const renderContent = (() => {
        switch (content.kind) {
            case "SecureNote":
                return <>Title: {content.title}. Content: {content.content}</>
            default:
                throw new Error("Other secret kinds not implemented")
        }
    })()

    if (content.kind === "SecureNote") {
        return <><button onClick={() => apiRequest.delete(`api/v3/consumersecrets/delete/${consumerSecretRaw.id}`).then(() => queryClient.invalidateQueries({ queryKey: ConsumerSecretsQueryKey }))}>(delete) </button> {renderContent}</>
    }

}