import { useEffect } from 'react';
import {
    Controller,
    useForm
} from 'react-hook-form';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import {
    Button,
    FormControl,
    Select,
    SelectItem
} from '@app/components/v2';

// TODO: modify in accordance with what was discussed with
// Maidul

// Do with select for now them replace.

const items = [
    { value: 'e2ee', label: 'E2EE' },
    { value: 'blind-indexed-e2ee', label: 'Blind Indexed E2EE' }
];

const formSchema = yup.object({
    mode: yup.string().required().label('Project Mode')
});

type FormData = yup.InferType<typeof formSchema>;

export const ProjectEncryptionModeSection = () => {
    const {
        handleSubmit,
        control,
        reset,
        formState: { isDirty, isSubmitting }
    } = useForm<FormData>({ resolver: yupResolver(formSchema) });

    useEffect(() => {
        reset({ mode: 'blind-indexed-e2ee' });
    }, []);
    
    const onFormSubmit = async ({ mode }: FormData) => {
        console.log('onFormSubmit');
        console.log('mode: ', mode);
    };

    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="rounded-md bg-white/5 p-6"
        >
            <p className="mb-4 text-xl font-semibold">Encryption Mode</p>
            <div className="mb-6 max-w-lg">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => {
                        console.log('field: ', field);
                        return (
                            <FormControl isError={Boolean(error)} errorText={error?.message}>
                                <Select
                                    {...field}
                                    className="w-full"
                                >
                                    {items.map(item => (
                                        <SelectItem value={item.value} key={`enc-mode-${item.value}`}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </FormControl>
                        );
                    }}
                    control={control}
                    name="mode"
                />
            </div>
            <Button
                isLoading={isSubmitting}
                color="mineshaft"
                size="sm"
                type="submit"
                isDisabled={!isDirty || isSubmitting}
                leftIcon={<FontAwesomeIcon icon={faCheck} />}
            >
                Save Changes
            </Button>
        </form>
    );
}