import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod"

import { Button, FormControl,Input  } from "@app/components/v2";



const schema = z.object({
    name: z.string().optional(),
    username: z.string().min(1),
    password: z.string().min(1),
})

export type FormData = z.infer<typeof schema>;

export const CreateLoginCredentialsForm = () => {

    const {
        control,
        handleSubmit,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: "",
            username: "",
            password: ""
        }
    })
    const onSubmit = (data: FormData) => {
        console.log(data);
    }
    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Name"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                        <Input {...field} placeholder="Name" type="text" />
                    </FormControl>
                )}
            />
            <Controller
                control={control}
                name="username"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Username"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                        <Input {...field} placeholder="Username" type="text" />
                    </FormControl>
                )}
            />
            <Controller
                control={control}
                name="password"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Password"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                        <Input {...field} placeholder="Password" type="password" />
                    </FormControl>
                )}
            />
            <Button type="submit" isLoading={isSubmitting}>
                Create
            </Button>
        </form>
    )
}