import { apiRequest } from "@app/config/request";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsumerSecretRaw, encodeConsumerSecret } from "./models";
import { ConsumerSecretItem } from "./ConsumerSecretItem";
import { useState } from "react";

export function ConsumerSecretsPage() {
    const { data } = useGetConsumerSecrets();

    return (
        <div style={{ background: "white" }}>
            <p className="text-3xl">Consumer Secrets</p>
            <ConsumerSecretCreateForm />
            <ConsumerSecretsList rawSecrets={data?.data.consumerSecretsData || []} />
        </div>
    );
}

function ConsumerSecretCreateForm() {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");

    const plaintextSecret = encodeConsumerSecret({ kind: "SecureNote", title, content });

    const queryClinet = useQueryClient();

    return <>
        <p className="text-2xl">Create a Secret</p>
        <label>
            Title Field:
            <input style={{ background: "white" }} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <br />
        <label>
            Content Field:
            <input style={{ background: "white" }} value={content} onChange={(e) => setContent(e.target.value)} />
        </label>

        <br />

        <button onClick={() =>
            apiRequest.post("api/v3/consumersecrets/create", { plaintextSecret }).then(() => queryClinet.invalidateQueries({ queryKey: ConsumerSecretsQueryKey }))
        }>Create Secret Button</button >
    </>
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
        queryKey: ConsumerSecretsQueryKey,
        queryFn: async () => await apiRequest.get<{ consumerSecretsData: ConsumerSecretRaw[] }>('api/v3/consumersecrets/all'),
    });
}

const ConsumerSecretsQueryKey = ["ConsumerSecrets"] as const; 