import { apiRequest } from "@app/config/request";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsumerSecretRaw, encodeConsumerSecret } from "./models";
import { ConsumerSecretItem } from "./ConsumerSecretItem";
import { useState } from "react";

export interface FormState {
    secretId: string,
    setSecretId: SetState,
    title: string,
    setTitle: SetState,
    content: string,
    setContent: SetState,
}

export function ConsumerSecretsPage() {
    const { data } = useGetConsumerSecrets();

    const [secretId, setSecretId] = useState(""); // The secretId selected for editing (or none).
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");

    const formState: FormState = {
        secretId, setSecretId, title, setTitle, content, setContent
    }

    return (
        <div style={{ background: "white" }}>
            <p className="text-3xl">Consumer Secrets</p>
            <ConsumerSecretCreateForm formState={formState} />
            <ConsumerSecretsList rawSecrets={data?.data.consumerSecretsData || []} formState={formState} />
        </div>
    );
}

function ConsumerSecretCreateForm({ formState: { title, setTitle, content, setContent, secretId, setSecretId } }: { formState: FormState }) {
    const plaintextSecret = encodeConsumerSecret({ kind: "SecureNote", title, content });

    const queryClinet = useQueryClient();

    const SubmitButton = secretId
        ? <button onClick={() =>
            apiRequest
                .patch("api/v3/consumersecrets/edit", { secretId, plaintextSecret })
                .then(() => {
                    queryClinet.invalidateQueries({ queryKey: ConsumerSecretsQueryKey });
                    setSecretId("");
                    setTitle("");
                    setContent("");
                })
        }>Edit Secret Button</button>
        : <button onClick={() =>
            apiRequest
                .post("api/v3/consumersecrets/create", { plaintextSecret })
                .then(() => {
                    queryClinet.invalidateQueries({ queryKey: ConsumerSecretsQueryKey });
                    setTitle("");
                    setContent("");
                })
        }>Create Secret Button</button >

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

        {SubmitButton}
    </>
}

function ConsumerSecretsList({ rawSecrets, formState }: { rawSecrets: ConsumerSecretRaw[]; formState: FormState }) {
    return <div>
        <p className="text-2xl">Consumer Secrets List</p>
        {rawSecrets.map((rawSecret) => <div key={rawSecret.id}>
            <ConsumerSecretItem consumerSecretRaw={rawSecret} formState={formState} />
        </div>)}
    </div>
}

function useGetConsumerSecrets() {
    return useQuery({
        queryKey: ConsumerSecretsQueryKey,
        queryFn: async () => await apiRequest.get<{ consumerSecretsData: ConsumerSecretRaw[] }>('api/v3/consumersecrets/all'),
    });
}

export const ConsumerSecretsQueryKey = ["ConsumerSecrets"] as const;
export type SetState = ReturnType<typeof useState<any>>[1];