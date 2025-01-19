import { apiRequest } from "@app/config/request";
import { useQuery } from "@tanstack/react-query";

export function ConsumerSecretsPage() {
    const { data } = useGetConsumerSecrets();

    return (
        <div style={{ background: "white" }}>
            Hello World
            <br /><br />
            <button onClick={() => apiRequest.post("api/v3/consumersecrets/create")}>Create Secret</button>
            <br /><br />
            <ConsumerSecretsList secrets={data?.data} />
        </div>
    );
}

function ConsumerSecretsList({ secrets }: { secrets: any }) {

    console.log("HELLO SECRETS");

    console.log(secrets);

    return <div>
        Consumer Secrets List
        {JSON.stringify(secrets)}
    </div>
}

function useGetConsumerSecrets() {
    return useQuery({
        queryKey: ["ConsumerSecrets"],
        queryFn: async () => await apiRequest.get<ConsumerSecretRaw[]>('api/v3/consumersecrets/all'),
    });
}




export interface ConsumerSecretRaw {
    organization: string,
    user: string,
    plaintextSecret: string,
}