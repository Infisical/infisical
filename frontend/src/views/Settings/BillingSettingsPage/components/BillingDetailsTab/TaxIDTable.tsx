import { faFileInvoice, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteOrgTaxId, useGetOrgTaxIds } from "@app/hooks/api";

const taxIDTypeLabelMap: { [key: string]: string } = {
  au_abn: "Australia ABN",
  au_arn: "Australia ARN",
  bg_uic: "Bulgaria UIC",
  br_cnpj: "Brazil CNPJ",
  br_cpf: "Brazil CPF",
  ca_bn: "Canada BN",
  ca_gst_hst: "Canada GST/HST",
  ca_pst_bc: "Canada PST BC",
  ca_pst_mb: "Canada PST MB",
  ca_pst_sk: "Canada PST SK",
  ca_qst: "Canada QST",
  ch_vat: "Switzerland VAT",
  cl_tin: "Chile TIN",
  eg_tin: "Egypt TIN",
  es_cif: "Spain CIF",
  eu_oss_vat: "EU OSS VAT",
  eu_vat: "EU VAT",
  gb_vat: "GB VAT",
  ge_vat: "Georgia VAT",
  hk_br: "Hong Kong BR",
  hu_tin: "Hungary TIN",
  id_npwp: "Indonesia NPWP",
  il_vat: "Israel VAT",
  in_gst: "India GST",
  is_vat: "Iceland VAT",
  jp_cn: "Japan CN",
  jp_rn: "Japan RN",
  jp_trn: "Japan TRN",
  ke_pin: "Kenya PIN",
  kr_brn: "South Korea BRN",
  li_uid: "Liechtenstein UID",
  mx_rfc: "Mexico RFC",
  my_frp: "Malaysia FRP",
  my_itn: "Malaysia ITN",
  my_sst: "Malaysia SST",
  no_vat: "Norway VAT",
  nz_gst: "New Zealand GST",
  ph_tin: "Philippines TIN",
  ru_inn: "Russia INN",
  ru_kpp: "Russia KPP",
  sa_vat: "Saudi Arabia VAT",
  sg_gst: "Singapore GST",
  sg_uen: "Singapore UEN",
  si_tin: "Slovenia TIN",
  th_vat: "Thailand VAT",
  tr_tin: "Turkey TIN",
  tw_vat: "Taiwan VAT",
  ua_vat: "Ukraine VAT",
  us_ein: "US EIN",
  za_vat: "South Africa VAT"
};

export const TaxIDTable = () => {
  const { currentOrg } = useOrganization();
  const { data, isLoading } = useGetOrgTaxIds(currentOrg?._id ?? "");
  const deleteOrgTaxId = useDeleteOrgTaxId();

  const handleDeleteTaxIdBtnClick = async (taxId: string) => {
    if (!currentOrg?._id) return;
    await deleteOrgTaxId.mutateAsync({
      organizationId: currentOrg._id,
      taxId
    });
  };

  return (
    <TableContainer className="mt-4">
      <Table>
        <THead>
          <Tr>
            <Th className="flex-1">Type</Th>
            <Th className="flex-1">Value</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {!isLoading &&
            data &&
            data?.length > 0 &&
            data.map(({ _id, type, value }) => (
              <Tr key={`tax-id-${_id}`} className="h-10">
                <Td>{taxIDTypeLabelMap[type]}</Td>
                <Td>{value}</Td>
                <Td>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Billing}
                  >
                    {(isAllowed) => (
                      <IconButton
                        onClick={async () => {
                          await handleDeleteTaxIdBtnClick(_id);
                        }}
                        size="lg"
                        colorSchema="danger"
                        variant="plain"
                        ariaLabel="update"
                        isDisabled={!isAllowed}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </IconButton>
                    )}
                  </OrgPermissionCan>
                </Td>
              </Tr>
            ))}
          {isLoading && <TableSkeleton columns={3} innerKey="tax-ids" />}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No Tax IDs on file" icon={faFileInvoice} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
