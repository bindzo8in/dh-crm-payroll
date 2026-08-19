"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getInvoiceById, getPublicInvoiceById, recordInvoicePayment, updateInvoiceStatus, sendInvoiceEmailAction, softDeleteInvoice } from "@/actions/invoice";
import { invoiceKeys } from "@/components/invoice/util";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeftIcon, CreditCardIcon, CheckCircle2Icon, Loader2Icon, DownloadIcon, MailIcon, MessageCircleIcon, PencilIcon, Trash2Icon, HistoryIcon, LandmarkIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { PaymentMethodType } from "@/lib/schemas/invoice-schema";

function getImageUrl(field: any): string | null {
  if (!field) return null;
  if (typeof field === "string") {
    try {
      const parsed = JSON.parse(field);
      return parsed.url || null;
    } catch {
      return null;
    }
  }
  if (typeof field === "object" && field.url) {
    return field.url;
  }
  return null;
}

export function InvoiceDetailView({ invoiceId, isPdfMode = false }: { invoiceId: string; isPdfMode?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodType>("BANK_TRANSFER");
  const [refId, setRefId] = useState("");
  const [notes, setNotes] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: invoiceKeys.detail(invoiceId),
    queryFn: () => (isPdfMode ? getPublicInvoiceById(invoiceId) : getInvoiceById(invoiceId)),
  });

  const invoice = data?.success ? data.data : null;

  const paymentMutation = useMutation({
    mutationFn: () =>
      recordInvoicePayment({
        invoiceId,
        amount: Number(amount),
        paymentMethod: method,
        paymentDate: new Date(),
        referenceId: refId,
        notes,
      }),
    onSuccess: () => {
      setPaymentOpen(false);
      setAmount("");
      setRefId("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: any) => updateInvoiceStatus(invoiceId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteInvoice(invoiceId),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message || "Invoice deleted!");
        router.push("/dashboard/invoices");
      } else {
        toast.error(res.message || "Failed to delete invoice");
      }
    },
    onError: () => {
      toast.error("Failed to delete invoice");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  const balance = (invoice?.grandTotal || 0) - (invoice?.amountPaid || 0);

  // Indian GST Tax Split Logic (Intra-State vs Inter-State)
  const isUSD = invoice?.currency === "USD";
  const companyState = (invoice?.company?.state || "").trim().toLowerCase();
  const customerState = (invoice?.customer?.state || "").trim().toLowerCase();
  const placeOfSupplyState = (invoice?.placeOfSupply || "").trim().toLowerCase();
  const effectiveBuyerState = placeOfSupplyState || customerState;

  const isSameState = !!(companyState && effectiveBuyerState && companyState === effectiveBuyerState);
  const isIntraState = !isUSD && isSameState;
  const isInterState = !isUSD && !isSameState;

  const totalTaxVal = invoice?.tax || 0;
  const cgstVal = isIntraState ? totalTaxVal / 2 : 0;
  const sgstVal = isIntraState ? totalTaxVal / 2 : 0;
  const igstVal = isInterState ? totalTaxVal : 0;

  const sampleTaxRate = invoice?.lineItems && invoice.lineItems.length > 0 ? (invoice.lineItems[0].taxRate || 18) : 18;
  const halfTaxRate = sampleTaxRate / 2;
  const symbol = invoice.currency === "USD" ? "$" : "₹";

  const companyLogoUrl = getImageUrl(invoice.company?.logo);
  const companySignatureUrl = getImageUrl(invoice.company?.signatureImage);
  const companySealUrl = getImageUrl(invoice.company?.sealImage);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const invNum = String(invoice.invoiceNumber).padStart(4, "0");
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-INV-${invNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Failed to download PDF:", error);
    } finally {
      setDownloading(false);
    }
  };

  const clientEmail = invoice?.customer?.primaryContactEmail;

  const handleWhatsAppShare = async () => {
    const url = `${window.location.origin}/i/${invoiceId}`;
    const text = encodeURIComponent(`Here is your invoice INV-${String(invoice.invoiceNumber).padStart(4, "0")}: ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");

    if (invoice.status === "DRAFT") {
      statusMutation.mutate("SENT");
    }
  };

  const handleEmailShare = async () => {
    if (!clientEmail) return;
    setSendingEmail(true);
    const url = `${window.location.origin}/i/${invoiceId}`;
    try {
      const res = await sendInvoiceEmailAction(invoiceId, clientEmail, url);
      if (res.success) {
        toast.success("Invoice email sent!");
        queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
      } else {
        toast.error(res.message || "Failed to send email");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className={`space-y-6 max-w-5xl mx-auto ${isPdfMode ? "p-0 bg-white" : "pb-12"}`}>
      {/* Header Actions */}
      {!isPdfMode && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden border-b pb-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
              <Link href="/dashboard/invoices">
                <ArrowLeftIcon className="h-4 w-4" />
              </Link>
            </Button>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-gray-900 whitespace-nowrap">
                  INV-{String(invoice.invoiceNumber).padStart(4, "0")}
                </h1>
                <Badge variant={invoice.status === "PAID" ? "default" : invoice.status === "DRAFT" ? "secondary" : "outline"} className="text-xs font-semibold px-2 py-0.5">
                  {invoice.status.replace("_", " ")}
                </Badge>
              </div>
              {invoice.title && <p className="text-xs text-muted-foreground font-medium">{invoice.title}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap justify-end">
            <Button
              variant="default"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="gap-2 shrink-0"
            >
              {downloading ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <DownloadIcon className="h-4 w-4" />
              )}
              Download PDF
            </Button>

            {invoice.status === "DRAFT" && (
              <Button
                onClick={() => statusMutation.mutate("SENT")}
                disabled={statusMutation.isPending}
                className="gap-2 shrink-0"
                variant="outline"
              >
                <CheckCircle2Icon className="h-4 w-4" /> Mark as Sent
              </Button>
            )}

            {invoice.status !== "PAID" && balance > 0 && (
              <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CreditCardIcon className="h-4 w-4" /> Record Payment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                  </DialogHeader>

                  <div className="bg-muted/50 border rounded-lg p-3 grid grid-cols-2 gap-3 text-sm my-1">
                    <div>
                      <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total Price</div>
                      <div className="text-base font-extrabold text-gray-900 mt-0.5">
                        {symbol}{invoice.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Balance Due</div>
                      <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {symbol}{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 py-1">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Payment Amount ({symbol})</label>
                      <Input
                        type="number"
                        max={balance}
                        placeholder={`Max ${symbol}${balance.toLocaleString("en-IN")}`}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Payment Method</label>
                      <Select value={method} onValueChange={(val: any) => setMethod(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                          <SelectItem value="UPI">UPI</SelectItem>
                          <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                          <SelectItem value="CHEQUE">Cheque</SelectItem>
                          <SelectItem value="CASH">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reference / Transaction ID</label>
                      <Input
                        placeholder="e.g. UTR / Transaction No."
                        value={refId}
                        onChange={(e) => setRefId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notes</label>
                      <Input
                        placeholder="Payment notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => paymentMutation.mutate()}
                      disabled={paymentMutation.isPending || !amount || Number(amount) <= 0}
                    >
                      {paymentMutation.isPending ? (
                        <>
                          <Loader2Icon className="h-4 w-4 mr-2 animate-spin" /> Recording...
                        </>
                      ) : (
                        "Submit Payment"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {invoice.status !== "PAID" && (
              <Button variant="outline" asChild className="gap-2 shrink-0">
                <Link href={`/dashboard/invoices/${invoiceId}/edit`}>
                  <PencilIcon className="h-4 w-4" /> Edit
                </Link>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {clientEmail && (
                  <DropdownMenuItem onClick={handleEmailShare} disabled={sendingEmail} className="gap-2 cursor-pointer">
                    {sendingEmail ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <MailIcon className="h-4 w-4 text-blue-600" />}
                    <span>Send via Email</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleWhatsAppShare} className="gap-2 cursor-pointer">
                  <MessageCircleIcon className="h-4 w-4 text-emerald-600" />
                  <span>Share via WhatsApp</span>
                </DropdownMenuItem>
                {invoice.status !== "PAID" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this invoice?")) {
                          deleteMutation.mutate();
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                    >
                      <Trash2Icon className="h-4 w-4" />
                      <span>Delete Invoice</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Printable Invoice Card */}
      <Card id="invoice-printable-card" className={`bg-card font-[family-name:var(--font-invoice)] p-5 md:p-6 space-y-3 shadow-sm border ${isPdfMode ? "p-5 space-y-3 border-none shadow-none bg-white" : ""}`}>
        <div className="flex justify-between items-start gap-6 border-b pb-2">
          <div className="flex flex-col items-start gap-1.5 max-w-md">
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt="Company Logo"
                crossOrigin="anonymous"
                className="h-16 max-w-[220px] object-contain rounded-md mb-1"
              />
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight uppercase">{invoice.company?.legalName || invoice.company?.displayName || "Design Hub CRM"}</h2>
              <div className="text-xs text-gray-900 font-medium leading-normal mt-0.5 space-y-0.5">
                {invoice.company?.address && <p>{invoice.company.address}</p>}
                {(invoice.company?.city || invoice.company?.state || invoice.company?.postalCode) && (
                  <p>
                    {[
                      invoice.company.city,
                      [invoice.company.state, invoice.company.postalCode].filter(Boolean).join(" - ")
                    ].filter(Boolean).join(", ")}
                  </p>
                )}
                {invoice.company?.country && <p>{invoice.company.country}</p>}
              </div>
              <div className="text-[10px] md:text-[11px] text-gray-800 mt-1 font-mono font-medium flex items-center gap-2 whitespace-nowrap">
                {invoice.company?.gstNumber && <span>GSTIN: {invoice.company.gstNumber}</span>}
                {invoice.company?.iecCode && <span>| IEC: {invoice.company.iecCode}</span>}
                {invoice.company?.phone && <span>| Phone: {invoice.company.phone}</span>}
                {invoice.company?.email && <span>| Email: {invoice.company.email}</span>}
                {invoice.company?.website && <span>| Web: {invoice.company.website}</span>}
              </div>
            </div>
          </div>

          <div className="text-left md:text-right space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight text-gray-900 leading-tight">
              {invoice.currency === "USD" ? "TAX INVOICE" : "TAX INVOICE"}
            </h2>
            <p className="text-xs font-semibold text-gray-900">
              #INV-{String(invoice.invoiceNumber).padStart(4, "0")}
            </p>
            <p className="text-[11px] text-gray-800">
              Issued: {new Date(invoice.createdAt).toLocaleDateString("en-IN")}
            </p>
            {invoice.dueDate && (
              <p className="text-[11px] text-gray-800">
                Due: {new Date(invoice.dueDate).toLocaleDateString("en-IN")}
              </p>
            )}
            <p className="text-[11px] font-semibold text-gray-900">
              Terms: {invoice.terms || "Due on Receipt"}
            </p>
          </div>
        </div>

        {/* Client & Bank Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-[11px] font-bold text-gray-900 uppercase tracking-wider mb-0.5">Billed To (Importer)</h3>
            <div className="font-bold text-sm leading-snug text-gray-900">{invoice.customerDisplayName}</div>
            {invoice.customerCompanyName && (
              <div className="text-xs font-semibold text-gray-800">{invoice.customerCompanyName}</div>
            )}
            <div className="text-xs font-medium text-gray-800 mt-0.5 space-y-0.5">
              {invoice.customer?.primaryContactEmail && <div>{invoice.customer.primaryContactEmail}</div>}
              {invoice.customer?.primaryContactPhone && (
                <div className="font-mono text-xs font-semibold tracking-normal text-gray-900">{invoice.customer.primaryContactPhone}</div>
              )}
              {invoice.customer?.taxId && (
                <div className="font-mono text-[11px] font-semibold text-gray-900">Client Tax ID / EIN: {invoice.customer.taxId}</div>
              )}
            </div>
          </div>

          {invoice.currency === "USD" && (
            <div className="text-xs space-y-0.5 self-start">
              <div className="font-bold text-[11px] uppercase tracking-wider text-gray-900">
                Export Compliance (LUT Route)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-gray-800 font-medium">
                <div><span className="font-bold font-sans text-gray-900">LUT ARN:</span> {invoice.company?.lutNumber || "Active LUT"}</div>
                <div><span className="font-bold font-sans text-gray-900">IEC Code:</span> {invoice.company?.iecCode || "10-digit IEC"}</div>
                <div><span className="font-bold font-sans text-gray-900">GSTIN:</span> {invoice.company?.gstNumber || "15-digit GST"}</div>
                <div><span className="font-bold font-sans text-gray-900">Place of Supply:</span> {invoice.placeOfSupply || "Foreign Country"}</div>
              </div>
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="border border-gray-300 rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 text-gray-900 font-bold border-b border-gray-300">
              <tr>
                <th className="text-center py-2 px-2.5 font-bold w-8">#</th>
                <th className="text-left py-2 px-2.5 font-bold">Item & Description</th>
                <th className="text-center py-2 px-2.5 font-bold">HSN / SAC</th>
                <th className="text-center py-2 px-2.5 font-bold">Qty</th>
                <th className="text-right py-2 px-2.5 font-bold">Rate</th>
                <th className="text-right py-2 px-2.5 font-bold">Tax Rate</th>
                <th className="text-right py-2 px-2.5 font-bold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoice.lineItems.map((item: any, index: number) => {
                const isGenericName = !item.name || item.name.toLowerCase() === "package";
                const displayName = isGenericName
                  ? (item.servicePackage?.name ? `${item.servicePackage.service?.name ? `${item.servicePackage.service.name} - ` : ""}${item.servicePackage.name}` : "Service Package")
                  : item.name;

                const rawCategorySubtitle = !isGenericName && (item.servicePackage?.service?.name || item.servicePackage?.name)
                  ? `${item.servicePackage.service?.name ? `${item.servicePackage.service.name} — ` : ""}${item.servicePackage.name}`
                  : null;

                const normalizeStr = (s: string) => s.toLowerCase().replace(/[-—\s]+/g, "");
                const isDuplicateSubtitle = rawCategorySubtitle && normalizeStr(displayName) === normalizeStr(rawCategorySubtitle);
                const categorySubtitle = !isDuplicateSubtitle ? rawCategorySubtitle : null;

                const isDuplicateDescription = item.description && (
                  normalizeStr(item.description) === normalizeStr(displayName) ||
                  (rawCategorySubtitle && normalizeStr(item.description) === normalizeStr(rawCategorySubtitle))
                );
                const showDescription = item.description && !isDuplicateDescription;

                return (
                  <tr key={item.id} className="align-top">
                    <td className="py-2.5 px-2 text-center text-gray-900 font-bold text-xs">{index + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-gray-900 leading-snug">{displayName}</div>
                      {categorySubtitle && (
                        <div className="text-[11px] font-semibold text-gray-700 mt-0.5">{categorySubtitle}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] font-semibold text-gray-900 whitespace-nowrap">
                      {item.sacCode || "9983"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-900 font-semibold whitespace-nowrap">
                      <span>{item.quantity} {item.unit}</span>
                      {item.billingCycle && (
                        <div className="text-[10px] text-gray-700 font-bold uppercase tracking-tight">{item.billingCycle.replace("_", " ")}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-900 font-semibold whitespace-nowrap">{symbol}{item.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap text-[11px] font-semibold text-gray-800">
                      {isUSD
                        ? "0% (Nil)"
                        : isIntraState
                          ? `CGST ${halfTaxRate}% + SGST ${halfTaxRate}%`
                          : `IGST ${item.taxRate}%`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">{symbol}{item.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals & Payments */}
        <div className="flex justify-between items-start gap-6 pt-2.5 border-t border-gray-300">
          <div className="flex-1 min-w-0 space-y-2 text-xs">
            {invoice.bankAccount && (
              <div className="space-y-1 text-[11px] text-gray-800 pt-0.5">
                <div className="font-bold text-xs uppercase tracking-wider text-gray-900 flex items-center gap-1 mb-0.5">
                  <LandmarkIcon className="h-3.5 w-3.5 text-gray-900" />
                  <span>Payment Details</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 items-baseline">
                  <span className="text-gray-700 font-medium">Bank Name:</span>
                  <span className="font-bold text-gray-900 uppercase">{invoice.bankAccount.bankName}</span>

                  <span className="text-gray-700 font-medium">Account Name:</span>
                  <span className="font-semibold text-gray-900 uppercase">{invoice.bankAccount.accountName}</span>

                  <span className="text-gray-700 font-medium">Account No:</span>
                  <span className="font-mono font-semibold text-gray-900">{invoice.bankAccount.accountNumber}</span>

                  <span className="text-gray-700 font-medium">IFSC:</span>
                  <span className="font-mono font-semibold text-gray-900 uppercase">{invoice.bankAccount.ifscCode}</span>

                  {invoice.bankAccount.swiftCode && (
                    <>
                      <span className="text-gray-700 font-medium">SWIFT Code (FIRC):</span>
                      <span className="font-mono font-bold text-gray-900">{invoice.bankAccount.swiftCode}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-64 shrink-0 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-800 font-medium">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-900">{symbol}{invoice.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {isUSD ? (
              <div className="flex justify-between text-gray-800 font-medium">
                <span>IGST Tax</span>
                <span className="font-semibold text-gray-900">0% (Nil)</span>
              </div>
            ) : isIntraState ? (
              <>
                <div className="flex justify-between text-gray-800 font-medium">
                  <span>CGST ({halfTaxRate}%)</span>
                  <span className="font-semibold text-gray-900">{symbol}{cgstVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-800 font-medium">
                  <span>SGST ({halfTaxRate}%)</span>
                  <span className="font-semibold text-gray-900">{symbol}{sgstVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-gray-800 font-medium">
                <span>IGST ({sampleTaxRate}%)</span>
                <span className="font-semibold text-gray-900">{symbol}{igstVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {invoice.discount > 0 && (
              <div className="flex justify-between text-gray-800 font-medium">
                <span>Discount</span>
                <span className="font-semibold text-gray-900">-{symbol}{invoice.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-gray-300 text-gray-900">
              <span>Grand Total</span>
              <span>{symbol}{invoice.grandTotal.toLocaleString("en-IN")}</span>
            </div>

            {invoice.currency === "USD" && (
              <div className="border-t border-dashed border-gray-400 pt-1 mt-1 text-[11px] text-gray-800 space-y-0.5">
                <div className="flex justify-between font-bold text-gray-900">
                  <span>INR Equivalent:</span>
                  <span>₹{(invoice.grandTotal * (invoice.exchangeRate || 83.5)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-700 font-medium">
                  <span>Exchange Rate:</span>
                  <span>₹{(invoice.exchangeRate || 83.5).toFixed(2)} / USD</span>
                </div>
              </div>
            )}

            <div className="flex justify-between text-gray-900 font-bold pt-1.5 border-t border-gray-300">
              <span>Paid</span>
              <span>{symbol}{invoice.amountPaid.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-300">
              <span>Balance Due</span>
              <span>{symbol}{Math.max(0, balance).toLocaleString("en-IN")}</span>
            </div>

            {invoice.currency === "USD" && (
              <div className="pt-1 border-t border-dashed border-gray-400 text-[8px] text-gray-800 font-medium italic text-right whitespace-nowrap">
                * Supply meant for export under LUT without payment of Integrated Tax
              </div>
            )}
          </div>
        </div>

        {/* Company Signature & Seal Block */}
        <div className={`border-t border-gray-300 flex justify-between items-end gap-6 break-inside-avoid ${isPdfMode ? "pt-4" : "pt-6"}`}>
          <div className="text-xs text-gray-800 font-medium max-w-md space-y-1.5">
            {invoice.notes && (
              <div>
                <span className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">Notes:</span>
                <p className="text-gray-800 font-medium whitespace-pre-line leading-relaxed mt-0.5">{invoice.notes}</p>
              </div>
            )}
            <p className="text-[11px] text-gray-700 font-medium italic pt-0.5">
              Thank you for your business! This invoice is electronically generated and verified.
            </p>
          </div>

          <div className="w-64 space-y-2 text-right">
            <div className={`relative border-b border-gray-400 flex items-end justify-end pb-2 ${isPdfMode ? "h-20" : "h-24"}`}>
              {companySealUrl && (
                <img
                  src={companySealUrl}
                  alt="Company Seal"
                  crossOrigin="anonymous"
                  className="max-h-24 max-w-[120px] object-contain absolute bottom-0 right-6 opacity-60 z-0 mix-blend-multiply pointer-events-none"
                />
              )}
              {companySignatureUrl ? (
                <img
                  src={companySignatureUrl}
                  alt="Company Signature"
                  crossOrigin="anonymous"
                  className="max-h-20 max-w-[180px] object-contain relative z-10"
                />
              ) : (
                <span className="text-xs text-muted-foreground italic relative z-10">
                  Authorized Signature
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {invoice.company?.legalName || invoice.company?.displayName || "Authorized Signatory"}
              </p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                For {invoice.company?.legalName || invoice.company?.displayName || "Company"}
              </p>
            </div>
          </div>
        </div>

        {/* Payments Audit List */}
        {invoice.payments.length > 0 && (
          <div className="pt-6 border-t space-y-3 print:hidden">
            <h3 className="text-sm font-semibold">Recorded Payment Transactions</h3>
            <div className="space-y-2">
              {invoice.payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-muted text-xs">
                  <div>
                    <span className="font-medium">{symbol}{p.amount.toLocaleString("en-IN")}</span> via{" "}
                    <span className="font-medium">{p.paymentMethod.replace("_", " ")}</span>
                    {p.referenceId && <span className="text-muted-foreground ml-2">(Ref: {p.referenceId})</span>}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity & Audit Log */}
        {invoice.activities && invoice.activities.length > 0 && (
          <div className="pt-6 border-t space-y-3 print:hidden">
            <div className="flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Invoice Activity & Audit Log</h3>
            </div>
            <div className="space-y-2">
              {invoice.activities.map((act: any) => (
                <div key={act.id} className="flex items-center justify-between p-3 rounded-md bg-muted/60 border text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-800 text-[10px] uppercase">
                      {act.action.replace("_", " ")}
                    </span>
                    <span className="text-foreground">{act.details}</span>
                    {act.user?.name && (
                      <span className="text-muted-foreground">by {act.user.name}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground whitespace-nowrap">
                    {new Date(act.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
