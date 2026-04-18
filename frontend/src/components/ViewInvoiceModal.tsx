import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import * as apiService from '../services/apiService';

interface ViewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceName: string;
  onUpdated?: () => void;
}

const getPrintUrl = (name: string, format: string) =>
  `/printview?doctype=Sales%20Invoice&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&no_letterhead=0`;

const getPdfUrl = (name: string, format: string) =>
  `/api/method/frappe.utils.print_format.download_pdf?doctype=Sales%20Invoice&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&no_letterhead=0`;

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Unpaid: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  Paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  Overdue: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  'Return': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  Cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  'Credit Note Issued': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const docstatusLabel: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' };

export const ViewInvoiceModal: React.FC<ViewInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoiceName,
  onUpdated,
}) => {
  const [invoice, setInvoice] = useState<any>(null);
  const [printFormat, setPrintFormat] = useState('Standard');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [editedPostingDate, setEditedPostingDate] = useState('');
  const [editedDueDate, setEditedDueDate] = useState('');
  const [editedTerms, setEditedTerms] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchInvoice = useCallback(async () => {
    setIsLoading(true);
    try {
      const [doc, printContext] = await Promise.all([
        apiService.getDoc('Sales Invoice', invoiceName),
        apiService.getSalesInvoicePrintContext(invoiceName),
      ]);
      setInvoice(doc);
      setPrintFormat(printContext?.print_format || 'Standard');
      setEditedItems(JSON.parse(JSON.stringify(doc.items || [])));
      setEditedPostingDate(doc.posting_date || '');
      setEditedDueDate(doc.due_date || '');
      setEditedTerms(doc.terms || '');
      const contactEmail = doc.contact_email || '';
      setEmailTo(contactEmail);
      setEmailSubject(`Invoice ${doc.name} – Watch Doctor`);
      setEmailMessage(
        `Dear ${doc.customer_name},\n\nPlease find your invoice details below.\n\nInvoice: ${doc.name}\nTotal Amount: ${doc.currency || ''} ${Number(doc.grand_total || 0).toFixed(2)}\nOutstanding: ${doc.currency || ''} ${Number(doc.outstanding_amount || 0).toFixed(2)}\n\nBest regards,\nWatch Doctor`
      );
    } catch (err) {
      showToast('Failed to load invoice.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [invoiceName]);

  useEffect(() => {
    if (isOpen && invoiceName) {
      setIsEditing(false);
      setShowEmailForm(false);
      fetchInvoice();
    }
  }, [isOpen, invoiceName, fetchInvoice]);

  const handleSaveEdit = async () => {
    if (!invoice) return;
    setIsSaving(true);
    try {
      const updatedDoc = {
        ...invoice,
        posting_date: editedPostingDate,
        due_date: editedDueDate,
        terms: editedTerms,
        items: editedItems,
      };
      const saved = await apiService.saveDoc(updatedDoc);
      setInvoice(saved);
      setIsEditing(false);
      showToast('Invoice saved successfully.', 'success');
      onUpdated?.();
    } catch (err: any) {
      showToast(`Save failed: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!invoice) return;
    setEditedItems(JSON.parse(JSON.stringify(invoice.items || [])));
    setEditedPostingDate(invoice.posting_date || '');
    setEditedDueDate(invoice.due_date || '');
    setEditedTerms(invoice.terms || '');
    setIsEditing(false);
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) { showToast('Please enter a recipient email address.', 'error'); return; }
    setIsSendingEmail(true);
    try {
      await apiService.apiFetchRaw('/api/method/frappe.core.doctype.communication.email.make', {
        method: 'POST',
        body: JSON.stringify({
          doctype: 'Sales Invoice',
          name: invoiceName,
          recipients: emailTo,
          subject: emailSubject,
          content: emailMessage.replace(/\n/g, '<br>'),
          send_email: 1,
          print_format: printFormat,
          attachments: JSON.stringify([{ print_format_attachment: 1, doctype: 'Sales Invoice', name: invoiceName, print_format: printFormat }]),
        }),
      });
      showToast('Email sent successfully!', 'success');
      setShowEmailForm(false);
    } catch (err: any) {
      showToast(`Failed to send email: ${err?.message || err}`, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const updateItemField = (index: number, field: string, value: any) => {
    const updated = editedItems.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [field]: value };
      if (field === 'qty' || field === 'rate') {
        newItem.amount = (parseFloat(newItem.qty) || 0) * (parseFloat(newItem.rate) || 0);
      }
      return newItem;
    });
    setEditedItems(updated);
  };

  const editedTotal = editedItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const taxTotal = (invoice?.taxes || []).reduce((s: number, t: any) => s + (parseFloat(t.tax_amount) || 0), 0);
  const displayItems = isEditing ? editedItems : (invoice?.items || []);
  const displayTotal = isEditing ? editedTotal : (invoice?.total || 0);
  const displayGrand = isEditing ? editedTotal + taxTotal : (invoice?.grand_total || 0);

  const docstatusVal = invoice?.docstatus ?? -1;
  const statusLabel = docstatusVal === 1 ? (invoice?.status || 'Submitted') : docstatusLabel[docstatusVal] || '';

  const paidAmount = invoice?.paid_amount || 0;
  const outstandingAmount = invoice?.outstanding_amount || 0;
  const isFullyPaid = outstandingAmount <= 0 && docstatusVal === 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sales Invoice – ${invoiceName}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-500" />
        </div>
      ) : !invoice ? (
        <p className="text-center text-gray-500 py-10">Could not load invoice.</p>
      ) : (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(getPrintUrl(invoiceName, printFormat), '_blank')}
            >
              🖨️ Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(getPdfUrl(invoiceName, printFormat), '_blank')}
            >
              📥 Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmailForm(v => !v)}
            >
              ✉️ Email
            </Button>
            {docstatusVal === 0 && !isEditing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                ✏️ Edit
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? 'Saving…' : '💾 Save'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
              </>
            )}
          </div>

          {/* Email Form */}
          {showEmailForm && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-blue-800 dark:text-blue-300">✉️ Send Invoice by Email</h4>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Message</label>
                <textarea
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSendEmail} disabled={isSendingEmail}>
                  {isSendingEmail ? 'Sending…' : 'Send Email'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowEmailForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Header Info */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{invoice.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sales Invoice</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={statusColors[statusLabel] || 'bg-gray-100 text-gray-700'}>
                  {statusLabel}
                </Badge>
                {isFullyPaid && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    ✅ Paid
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Customer</p>
                <p className="font-semibold text-gray-900 dark:text-white">{invoice.customer_name || invoice.customer}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Posting Date</p>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedPostingDate}
                    onChange={e => setEditedPostingDate(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-semibold text-gray-900 dark:text-white">{invoice.posting_date || '—'}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Due Date</p>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedDueDate}
                    onChange={e => setEditedDueDate(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-semibold text-gray-900 dark:text-white">{invoice.due_date || '—'}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Currency</p>
                <p className="font-semibold text-gray-900 dark:text-white">{invoice.currency || '—'}</p>
              </div>
            </div>

            {/* Contact Info */}
            {(invoice.contact_display || invoice.contact_email || invoice.contact_mobile) && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {invoice.contact_display && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Contact</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{invoice.contact_display}</p>
                  </div>
                )}
                {invoice.contact_email && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{invoice.contact_email}</p>
                  </div>
                )}
                {invoice.contact_mobile && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Mobile</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{invoice.contact_mobile}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Status Banner */}
          {docstatusVal === 1 && (
            <div className={`rounded-2xl p-4 flex items-center justify-between ${isFullyPaid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700' : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{isFullyPaid ? '✅' : '🔔'}</span>
                <div>
                  <p className={`font-semibold ${isFullyPaid ? 'text-green-800 dark:text-green-300' : 'text-orange-800 dark:text-orange-300'}`}>
                    {isFullyPaid ? 'Fully Paid' : 'Payment Pending'}
                  </p>
                  {!isFullyPaid && (
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      Outstanding: {invoice.currency} {Number(outstandingAmount).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paid</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  {invoice.currency} {Number(paidAmount).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Items Table */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Items &amp; Services</h4>
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-1/2">Description</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">Qty</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">UOM</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Rate</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {displayItems.map((item: any, idx: number) => (
                    <tr key={item.name || idx} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{item.item_name || item.item_code}</p>
                        {item.description && item.description !== item.item_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={editedItems[idx]?.qty ?? item.qty}
                            onChange={e => updateItemField(idx, 'qty', e.target.value)}
                            className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-center text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-800 dark:text-gray-200">{Number(item.qty).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{item.uom}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editedItems[idx]?.rate ?? item.rate}
                            onChange={e => updateItemField(idx, 'rate', e.target.value)}
                            className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-800 dark:text-gray-200">{Number(item.rate).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                        {Number(isEditing ? (editedItems[idx]?.amount ?? item.amount) : item.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Taxes */}
          {(invoice.taxes || []).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Taxes &amp; Charges</h4>
              <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Description</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Rate %</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {(invoice.taxes || []).map((tax: any, idx: number) => (
                      <tr key={idx} className="bg-white dark:bg-gray-800">
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{tax.description}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{tax.rate}%</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{Number(tax.tax_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {invoice.currency} {Number(displayTotal).toFixed(2)}
                </span>
              </div>
              {taxTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Taxes &amp; Charges</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {invoice.currency} {Number(taxTotal).toFixed(2)}
                  </span>
                </div>
              )}
              {(invoice.discount_amount > 0 || invoice.additional_discount_percentage > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Discount</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    -{invoice.currency} {Number(invoice.discount_amount || 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t border-blue-200 dark:border-blue-700 pt-3 mt-2">
                <span className="text-gray-900 dark:text-white">Grand Total</span>
                <span className="text-blue-700 dark:text-blue-400">
                  {invoice.currency} {Number(displayGrand).toFixed(2)}
                </span>
              </div>
              {docstatusVal === 1 && (
                <>
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600 dark:text-gray-400">Paid Amount</span>
                    <span className="text-green-700 dark:text-green-400 font-semibold">
                      {invoice.currency} {Number(paidAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className={outstandingAmount > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400'}>
                      Outstanding
                    </span>
                    <span className={outstandingAmount > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400'}>
                      {invoice.currency} {Number(outstandingAmount).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Terms & Conditions */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Terms &amp; Conditions</h4>
            {isEditing ? (
              <textarea
                value={editedTerms}
                onChange={e => setEditedTerms(e.target.value)}
                rows={3}
                placeholder="Enter terms and conditions..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            ) : invoice.terms ? (
              <div
                className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4"
                dangerouslySetInnerHTML={{ __html: invoice.terms }}
              />
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No terms specified.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
