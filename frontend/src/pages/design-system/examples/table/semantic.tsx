import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";

export default function SemanticTable() {
  return (
    <Table aria-label="Environment inventory">
      <TableCaption>Fabricated environment inventory</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Environment</TableHead>
          <TableHead scope="col" className="text-right">
            Secrets
          </TableHead>
          <TableHead scope="col">Rotation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Production</TableCell>
          <TableCell className="text-right">128</TableCell>
          <TableCell>2 overdue</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Staging</TableCell>
          <TableCell className="text-right">0</TableCell>
          <TableCell>No secrets</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">128</TableCell>
          <TableCell>2 environments</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
