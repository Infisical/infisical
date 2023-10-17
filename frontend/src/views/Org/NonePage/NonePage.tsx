import { useEffect } from "react";
import * as yup from "yup";

import { usePopUp } from "@app/hooks/usePopUp";

import { CreateOrgModal } from "../components";

const schema = yup
  .object({
    name: yup.string().required("Organization name is required")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

export const NonePage = () => {
    const { createNotification } = useNotificationContext();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
        "createOrg",
    ] as const);
    
    const { mutateAsync } = useCreateOrg();
    
    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema),
        defaultValues: {
            name: ""
        }
    });
    
    useEffect(() => {
        handlePopUpOpen("createOrg");
    }, []);
    
    const onFormSubmit = async ({ name }: FormData) => {
        try {
            
            const organization = await mutateAsync({
                name
            });
            
            localStorage.setItem("orgData.id", organization._id);

            createNotification({
                text: "Successfully created organization",
                type: "success"
            });

  useEffect(() => {
    handlePopUpOpen("createOrg");
  }, []);

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <CreateOrgModal
        isOpen={popUp.createOrg.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </div>
  );
};
