import { Controller, useForm } from "react-hook-form"; 
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useAddOrgTaxId } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const taxIDTypes = [
  { label: "Australia ABN", value: "au_abn" },
  { label: "Australia ARN", value: "au_arn" },
  { label: "Bulgaria UIC", value: "bg_uic" },
  { label: "Brazil CNPJ", value: "br_cnpj" },
  { label: "Brazil CPF", value: "br_cpf" },
  { label: "Canada BN", value: "ca_bn" },
  { label: "Canada GST/HST", value: "ca_gst_hst" },
  { label: "Canada PST BC", value: "ca_pst_bc" },
  { label: "Canada PST MB", value: "ca_pst_mb" },
  { label: "Canada PST SK", value: "ca_pst_sk" },
  { label: "Canada QST", value: "ca_qst" },
  { label: "Switzerland VAT", value: "ch_vat" },
  { label: "Chile TIN", value: "cl_tin" },
  { label: "Egypt TIN", value: "eg_tin" },
  { label: "Spain CIF", value: "es_cif" },
  { label: "EU OSS VAT", value: "eu_oss_vat" },
  { label: "EU VAT", value: "eu_vat" },
  { label: "GB VAT", value: "gb_vat" },
  { label: "Georgia VAT", value: "ge_vat" },
  { label: "Hong Kong BR", value: "hk_br" },
  { label: "Hungary TIN", value: "hu_tin" },
  { label: "Indonesia NPWP", value: "id_npwp" },
  { label: "Israel VAT", value: "il_vat" },
  { label: "India GST", value: "in_gst" },
  { label: "Iceland VAT", value: "is_vat" },
  { label: "Japan CN", value: "jp_cn" },
  { label: "Japan RN", value: "jp_rn" },
  { label: "Japan TRN", value: "jp_trn" },
  { label: "Kenya PIN", value: "ke_pin" },
  { label: "South Korea BRN", value: "kr_brn" },
  { label: "Liechtenstein UID", value: "li_uid" },
  { label: "Mexico RFC", value: "mx_rfc" },
  { label: "Malaysia FRP", value: "my_frp" },
  { label: "Malaysia ITN", value: "my_itn" },
  { label: "Malaysia SST", value: "my_sst" },
  { label: "Norway VAT", value: "no_vat" },
  { label: "New Zealand GST", value: "nz_gst" },
  { label: "Philippines TIN", value: "ph_tin" },
  { label: "Russia INN", value: "ru_inn" },
  { label: "Russia KPP", value: "ru_kpp" },
  { label: "Saudi Arabia VAT", value: "sa_vat" },
  { label: "Singapore GST", value: "sg_gst" },
  { label: "Singapore UEN", value: "sg_uen" },
  { label: "Slovenia TIN", value: "si_tin" },
  { label: "Thailand VAT", value: "th_vat" },
  { label: "Turkey TIN", value: "tr_tin" },
  { label: "Taiwan VAT", value: "tw_vat" },
  { label: "Ukraine VAT", value: "ua_vat" },
  { label: "US EIN", value: "us_ein" },
  { label: "South Africa VAT", value: "za_vat" }
];

const schema = yup.object({
    type: yup.string().required("Tax ID type is required"),
    value: yup.string().required("Tax ID value is required")
}).required();

export type AddTaxIDFormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addTaxID"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addTaxID"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addTaxID"]>, state?: boolean) => void;
};

export const TaxIDModal = ({
    popUp,
    handlePopUpClose,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const addOrgTaxId = useAddOrgTaxId();

    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<AddTaxIDFormData>({
        resolver: yupResolver(schema)
    });

    const onTaxIDModalSubmit = async ({ type, value }: AddTaxIDFormData) => {
        try {
            if (!currentOrg?._id) return;
            await addOrgTaxId.mutateAsync({
                organizationId: currentOrg._id,
                type,
                value
            });

            createNotification({
                text: "Successfully added Tax ID",
                type: "success"
            });
            handlePopUpClose("addTaxID");
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to add Tax ID",
                type: "error"
            });
        }
    }

    return (
        <Modal
            isOpen={popUp?.addTaxID?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("addTaxID", isOpen);
                reset();
            }}
        >
            <ModalContent title="Add Tax ID">
            <form onSubmit={handleSubmit(onTaxIDModalSubmit)}>
                <Controller
                    control={control}
                    name="type"
                    defaultValue="eu_vat"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                            label="Type"
                            errorText={error?.message}
                            isError={Boolean(error)}
                        >
                            <Select
                                defaultValue={field.value}
                                {...field}
                                onValueChange={(e) => onChange(e)}
                                className="w-full"
                            >
                                {taxIDTypes.map(({ label, value }) => (
                                    <SelectItem value={String(value || "")} key={label}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                />
                <Controller
                    control={control}
                    defaultValue=""
                    name="value"
                    render={({ field, fieldState: { error } }) => (
                        <FormControl
                            label="Value"
                            isError={Boolean(error)}
                            errorText={error?.message}
                        >
                        <Input 
                            {...field} 
                            placeholder="DE000000000"
                        />
                        </FormControl>
                    )}
                />
                <div className="mt-8 flex items-center">
                <Button
                    className="mr-4"
                    size="sm"
                    type="submit"
                    isLoading={isSubmitting}
                    isDisabled={isSubmitting}
                >
                    Add
                </Button>
                <Button colorSchema="secondary" variant="plain">
                    Cancel
                </Button>
                </div>
            </form>
            </ModalContent>
        </Modal>
    );
}