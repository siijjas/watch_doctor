import React, { useState, useEffect } from 'react';
import type { RepairOrder } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Input } from './ui/Input';
import { useAppConfig } from '../context/AppConfigContext';

interface CreateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (sourceType: 'quotation' | 'order', paymentType: 'full' | 'advance' | 'balance', amount?: number) => Promise<void>;
    order: RepairOrder;
    hasQuotation: boolean;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
    isOpen,
    onClose,
    onSave,
    order,
    hasQuotation
}) => {
    const { formatCurrency } = useAppConfig();
    const [sourceType, setSourceType] = useState<'quotation' | 'order'>(hasQuotation ? 'quotation' : 'order');
    const [paymentType, setPaymentType] = useState<'full' | 'advance' | 'balance'>('full');
    const [customAmount, setCustomAmount] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    // Calculate total amount based on source
    const getTotalAmount = () => {
        if (sourceType === 'quotation' && order.quotation_amount) {
            return order.quotation_amount;
        }
        // If no quotation, calculate from order items (this will be 0 if not calculated yet)
        return order.quotation_amount || 0;
    };

    const totalAmount = getTotalAmount();
    const paidAmount = order.paid_amount || 0;
    const balanceAmount = totalAmount - paidAmount;

    // Reset custom amount when payment type changes
    useEffect(() => {
        if (paymentType === 'full') {
            setCustomAmount(totalAmount.toFixed(2));
        } else if (paymentType === 'balance') {
            setCustomAmount(balanceAmount.toFixed(2));
        } else {
            setCustomAmount('');
        }
    }, [paymentType, totalAmount, balanceAmount]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if ((paymentType === 'advance' || paymentType === 'balance') && !customAmount) {
            alert('Please enter an amount');
            return;
        }

        const amount = paymentType === 'full' ? totalAmount : parseFloat(customAmount);

        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        if (amount > balanceAmount) {
            alert(`Amount cannot exceed balance due (${formatCurrency(balanceAmount)})`);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(sourceType, paymentType, amount);
            onClose();
        } catch (error) {
            alert('Failed to create invoice: ' + error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Sales Invoice">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Source Selection */}
                {hasQuotation && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Invoice Source
                        </label>
                        <Select
                            value={sourceType}
                            onChange={(e) => setSourceType(e.target.value as 'quotation' | 'order')}
                        >
                            <option value="quotation">From Quotation</option>
                            <option value="order">Direct from Repair Order</option>
                        </Select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {sourceType === 'quotation'
                                ? 'Use items and prices from the quotation'
                                : 'Use items and prices directly from the repair order'}
                        </p>
                    </div>
                )}

                {/* Payment Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Payment Type
                    </label>
                    <Select
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value as 'full' | 'advance' | 'balance')}
                    >
                        <option value="full">Full Payment</option>
                        <option value="advance">Advance Payment</option>
                        {paidAmount > 0 && <option value="balance">Balance Payment</option>}
                    </Select>
                </div>

                {/* Amount Input for Partial Payments */}
                {(paymentType === 'advance' || paymentType === 'balance') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Amount
                        </label>
                        <Input
                            type="number"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            step="0.01"
                            min="0"
                            max={balanceAmount}
                            placeholder="Enter amount"
                            required
                        />
                        {paymentType === 'advance' && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Suggested: {formatCurrency(totalAmount * 0.5)} (50% advance)
                            </p>
                        )}
                    </div>
                )}

                {/* Payment Summary */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Payment Summary</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Total Amount:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(totalAmount)}
                            </span>
                        </div>
                        {paidAmount > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Paid Amount:</span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {formatCurrency(paidAmount)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Balance Due:</span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {formatCurrency(balanceAmount)}
                                    </span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Invoice Amount:</span>
                            <span className="font-bold text-lg text-green-600 dark:text-green-400">
                                {paymentType === 'full'
                                    ? formatCurrency(totalAmount)
                                    : formatCurrency(customAmount ? parseFloat(customAmount) : 0)}
                            </span>
                        </div>
                        {paymentType !== 'full' && customAmount && (
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Remaining Balance:</span>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {formatCurrency(balanceAmount - parseFloat(customAmount || '0'))}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment Type Info */}
                {paymentType !== 'full' && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Note:</strong>{' '}
                            {paymentType === 'advance'
                                ? 'An advance payment invoice will be created. You can create another invoice for the balance later.'
                                : 'A balance payment invoice will be created to settle the remaining amount.'}
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Creating...' : 'Create Invoice'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
