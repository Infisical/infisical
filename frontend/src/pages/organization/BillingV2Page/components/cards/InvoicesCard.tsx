import { ExternalLink, ReceiptText } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { BillingV2Invoice } from "@app/hooks/api";

import { fmtMoney } from "../../billing-v2-format";
import { CardEmpty } from "../shared";

export const InvoicesCard = ({ invoices }: { invoices: BillingV2Invoice[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <ReceiptText className="size-4 text-accent" />
        Invoices
      </CardTitle>
    </CardHeader>
    <CardContent>
      {invoices.length === 0 ? (
        <CardEmpty
          title="No invoices yet"
          description="Your first invoice appears after your next billing date."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.date}</TableCell>
                <TableCell className="tabular-nums">{fmtMoney(inv.amount, 2)}</TableCell>
                <TableCell>
                  {inv.paid ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <Badge variant="danger">Unpaid</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {inv.pdfUrl ? (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline"
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      PDF
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);
