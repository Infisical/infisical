import { apiRequest } from "@app/config/request";
import { useQuery } from "@tanstack/react-query";
import { ConsumerSecretRaw, encodeConsumerSecret } from "./models";
import { ConsumerSecretItem } from "./ConsumerSecretItem";

export function ConsumerSecretsPage() {
    const { data } = useGetConsumerSecrets();

    return (
        <div style={{ background: "white" }}>
            <p className="text-3xl">Consumer Secrets</p>
            <button onClick={() => apiRequest.post("api/v3/consumersecrets/create", {
                plaintextSecret: encodeConsumerSecret({ kind: "SecureNote", title: "My Title", content: "My Content" })
            })}>Create Secret</button>
            <br /><br />
            <ConsumerSecretsList rawSecrets={data?.data.consumerSecretsData || []} />
        </div>
    );
}

function ConsumerSecretsList({ rawSecrets }: { rawSecrets: ConsumerSecretRaw[] }) {
    return <div>
        <p className="text-2xl">Consumer Secrets List</p>
        {rawSecrets.map((rawSecret) => <div key={rawSecret.id}>
            <ConsumerSecretItem consumerSecretRaw={rawSecret} />
        </div>)}
    </div>
}

function useGetConsumerSecrets() {
    return useQuery({
        queryKey: ["ConsumerSecrets"],
        queryFn: async () => await apiRequest.get<{ consumerSecretsData: ConsumerSecretRaw[] }>('api/v3/consumersecrets/all'),
    });
}




