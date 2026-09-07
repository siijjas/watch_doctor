import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Toggle } from './ui/Toggle';
import * as apiService from '../services/apiService';
import { useAppConfig } from '../context/AppConfigContext';
import type { POSPaymentSplit } from '../services/apiService';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    repairOrderName: string;
    invoiceName: string;
    invoiceAmount: number;
    onSuccess: () => void;
}

interface PaymentSplitRow extends POSPaymentSplit {
    id: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
    isOpen,
    onClose,
    repairOrderName,
    invoiceName,
    invoiceAmount,
    onSuccess
}) => {
    const { formatCurrency, config } = useAppConfig();
    const [discount, setDiscount] = useState<number>(0);
    const [paymentSplits, setPaymentSplits] = useState<PaymentSplitRow[]>([]);
    const [isCreditSale, setIsCreditSale] = useState(false);
    const [isSplitPayment, setIsSplitPayment] = useState(false);
    const [dueDate, setDueDate] = useState('');
    const [markAsDelivered, setMarkAsDelivered] = useState<boolean>(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentModes, setPaymentModes] = useState<Array<{ name: string; type: string }>>([]);
    const [isLoadingModes, setIsLoadingModes] = useState(true);

    const currencyPrecision = Math.max(0, config.decimalPlaces || 2);
    const amountStep = currencyPrecision > 0 ? 1 / Math.pow(10, currencyPrecision) : 1;

    const roundCurrencyValue = (value: number) => {
        const factor = Math.pow(10, currencyPrecision);
        return Math.round(value * factor) / factor;
    };

    const getDefaultDueDate = () => {
        const date = new Date();
        date.setDate(date.getDate() + 15);
        return date.toISOString().slice(0, 10);
    };

    // Fetch payment modes on mount
    useEffect(() => {
        const fetchPaymentModes = async () => {
            try {
                const modes = await apiService.getPaymentModes();

                // Use fetched modes if available, otherwise use fallback
                if (modes && modes.length > 0) {
                    setPaymentModes(modes);
                } else {
                    // Fallback to default modes if config is empty
                    setPaymentModes([
                        { name: 'Cash', type: 'Cash' },
                        { name: 'Credit Card', type: 'Bank' }
                    ]);
                }
            } catch (error) {
                console.error('Failed to fetch payment modes:', error);
                // Fallback to default modes on error
                setPaymentModes([
                    { name: 'Cash', type: 'Cash' },
                    { name: 'Credit Card', type: 'Bank' }
                ]);
            } finally {
                setIsLoadingModes(false);
            }
        };

        if (isOpen) {
            fetchPaymentModes();
        }
    }, [isOpen]);

    const finalAmount = roundCurrencyValue(invoiceAmount - discount);
    const defaultPaymentMode = paymentModes[0]?.name || 'Cash';

    // Reset split rows to a single row covering the final amount whenever the modal
    // opens or the final amount changes, unless the user has already added more rows.
    useEffect(() => {
        if (!isOpen) return;
        setPaymentSplits(prev => {
            if (prev.length > 1) return prev;

            const current = prev[0];
            const nextMode = current?.mode_of_payment || defaultPaymentMode;

            if (current && current.mode_of_payment === nextMode && Math.abs((current.amount || 0) - finalAmount) < amountStep / 2) {
                return prev;
            }

            return [{
                id: current?.id || `${Date.now()}`,
                mode_of_payment: nextMode,
                amount: finalAmount,
            }];
        });
    }, [isOpen, finalAmount, defaultPaymentMode, amountStep]);

    const selectedMode = paymentSplits[0]?.mode_of_payment || defaultPaymentMode;

    const handleSelectSingleMode = (mode: string) => {
        setPaymentSplits(prev => [{
            id: prev[0]?.id || `${Date.now()}`,
            mode_of_payment: mode,
            amount: finalAmount,
        }]);
    };

    const handleSwitchToSplit = () => setIsSplitPayment(true);

    const handleSwitchToSingle = () => {
        setIsSplitPayment(false);
        setPaymentSplits(prev => [{
            id: prev[0]?.id || `${Date.now()}`,
            mode_of_payment: prev[0]?.mode_of_payment || defaultPaymentMode,
            amount: finalAmount,
        }]);
    };

    const getNextPaymentMode = (existingPayments: PaymentSplitRow[]) => {
        const availableModes = paymentModes.map(mode => mode.name).filter(Boolean);
        if (availableModes.length === 0) return 'Cash';

        const usedModes = new Set(existingPayments.map(payment => payment.mode_of_payment));
        return availableModes.find(mode => !usedModes.has(mode)) || availableModes[existingPayments.length % availableModes.length];
    };

    const updatePaymentSplit = (id: string, field: 'mode_of_payment' | 'amount', value: string | number) => {
        setPaymentSplits(prev => prev.map(payment => {
            if (payment.id !== id) return payment;

            if (field === 'amount') {
                const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;
                return { ...payment, amount: roundCurrencyValue(Math.max(0, numericValue)) };
            }

            return { ...payment, mode_of_payment: String(value) };
        }));
    };

    const addPaymentSplit = () => {
        setPaymentSplits(prev => {
            if (prev.length === 0) {
                return [{
                    id: `${Date.now()}`,
                    mode_of_payment: defaultPaymentMode,
                    amount: finalAmount,
                }];
            }

            const lastIndex = prev.length - 1;
            const lastPayment = prev[lastIndex];
            const splitAmount = roundCurrencyValue((Number(lastPayment.amount) || 0) / 2);
            const remainingAmount = roundCurrencyValue((Number(lastPayment.amount) || 0) - splitAmount);
            const suggestedMode = getNextPaymentMode(prev);

            return [
                ...prev.slice(0, lastIndex),
                { ...lastPayment, amount: remainingAmount },
                {
                    id: `${Date.now()}-${prev.length}`,
                    mode_of_payment: suggestedMode,
                    amount: splitAmount,
                }
            ];
        });
    };

    const removePaymentSplit = (id: string) => {
        setPaymentSplits(prev => {
            if (prev.length === 1) return prev;

            const next = prev.filter(payment => payment.id !== id);
            if (next.length === 1) {
                return [{ ...next[0], amount: finalAmount }];
            }
            return next;
        });
    };

    const paymentAllocated = useMemo(() => {
        return roundCurrencyValue(paymentSplits.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
    }, [paymentSplits, currencyPrecision]);

    const paymentRemaining = useMemo(() => {
        return roundCurrencyValue(finalAmount - paymentAllocated);
    }, [finalAmount, paymentAllocated, currencyPrecision]);

    const hasInvalidPayments = paymentSplits.length === 0 || paymentSplits.some(payment => !payment.mode_of_payment || (Number(payment.amount) || 0) <= 0);
    const isPaymentBalanced = Math.abs(paymentRemaining) < amountStep / 2;

    const autoBalancePayments = () => {
        setPaymentSplits(prev => {
            if (prev.length === 0) return prev;
            const lastIndex = prev.length - 1;
            const lastPayment = prev[lastIndex];
            const adjustedAmount = roundCurrencyValue((Number(lastPayment.amount) || 0) + paymentRemaining);

            if (adjustedAmount < 0) return prev;

            return [
                ...prev.slice(0, lastIndex),
                { ...lastPayment, amount: adjustedAmount }
            ];
        });
    };

    const handleSubmit = async () => {
        if (discount > invoiceAmount) {
            alert('Discount cannot be greater than invoice amount');
            return;
        }

        setIsSubmitting(true);
        try {
            const payments: POSPaymentSplit[] = paymentSplits.map(({ mode_of_payment, amount }) => ({ mode_of_payment, amount }));
            await apiService.finalizeInvoice(
                repairOrderName,
                invoiceName,
                discount,
                payments,
                markAsDelivered,
                { isCreditSale, dueDate }
            );
            alert('Payment processed successfully!');
            onSuccess();
            onClose();
        } catch (error: any) {
            alert(`Failed to process payment: ${error.message || error}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Complete Payment">
            <div className="space-y-4">
                {/* Invoice Amount */}
                <div className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-800 rounded">
                    <span className="font-medium">Invoice Amount:</span>
                    <span className="text-lg font-bold text-blue-600">{formatCurrency(invoiceAmount)}</span>
                </div>

                {/* Discount */}
                <div>
                    <label htmlFor="discount" className="block text-sm font-medium mb-1">Discount</label>
                    <Input
                        id="discount"
                        type="number"
                        min="0"
                        max={invoiceAmount}
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        placeholder="Enter discount amount"
                    />
                </div>

                {/* Final Amount */}
                <div className="flex justify-between items-center p-3 bg-green-100 dark:bg-green-900 rounded">
                    <span className="font-medium">Final Amount:</span>
                    <span className="text-xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(finalAmount)}
                    </span>
                </div>

                {isCreditSale ? (
                    <div>
                        <label htmlFor="dueDate" className="block text-sm font-medium mb-1">Payment Due Date</label>
                        <input
                            id="dueDate"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            The full amount will be recorded as an outstanding balance, collectible later from the POS "Collect Payment" screen.
                        </p>
                    </div>
                ) : (
                    <div>
                        {isLoadingModes ? (
                            <div className="text-center py-4 text-gray-500">Loading payment modes...</div>
                        ) : !isSplitPayment ? (
                            <>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium">Payment Mode</label>
                                    <button type="button" onClick={handleSwitchToSplit} className="text-xs font-medium text-blue-600">
                                        Split into multiple methods
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {paymentModes.map((mode) => (
                                        <button
                                            key={mode.name}
                                            type="button"
                                            onClick={() => handleSelectSingleMode(mode.name)}
                                            className={`p-3 rounded border-2 text-sm font-medium transition-all ${selectedMode === mode.name
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                                                }`}
                                        >
                                            {mode.type === 'Cash' && '💵 '}
                                            {mode.type === 'Bank' && '💳 '}
                                            {mode.type === 'General' && '📝 '}
                                            {mode.name}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium">Payment Methods</label>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={handleSwitchToSingle} className="text-xs font-medium text-blue-600">
                                            Use single method
                                        </button>
                                        <Button variant="outline" size="sm" onClick={addPaymentSplit} className="text-xs">
                                            + Add Split
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {paymentSplits.map((payment, index) => (
                                        <div key={payment.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                                            <select
                                                value={payment.mode_of_payment}
                                                onChange={(e) => updatePaymentSplit(payment.id, 'mode_of_payment', e.target.value)}
                                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                                            >
                                                {paymentModes.map(mode => (
                                                    <option key={mode.name} value={mode.name}>
                                                        {mode.type === 'Cash' && '💵 '}
                                                        {mode.type === 'Bank' && '💳 '}
                                                        {mode.type === 'General' && '📝 '}
                                                        {mode.name}
                                                    </option>
                                                ))}
                                                {paymentModes.length === 0 && <option value="Cash">Cash</option>}
                                            </select>
                                            <input
                                                type="number"
                                                min="0"
                                                step={amountStep}
                                                value={payment.amount}
                                                onChange={(e) => updatePaymentSplit(payment.id, 'amount', e.target.value)}
                                                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                                            />
                                            <button
                                                onClick={() => removePaymentSplit(payment.id)}
                                                disabled={paymentSplits.length === 1}
                                                className="text-red-500 text-sm disabled:opacity-40"
                                                title={index === 0 && paymentSplits.length === 1 ? 'At least one payment row is required' : 'Remove split'}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-xs text-gray-500">Split this payment across multiple methods.</p>
                                    {Math.abs(paymentRemaining) >= amountStep / 2 && (
                                        <button onClick={autoBalancePayments} className="text-xs font-medium text-blue-600">
                                            Auto-balance
                                        </button>
                                    )}
                                </div>
                                <div className={`flex justify-between mt-2 text-sm ${paymentRemaining === 0 ? 'text-green-600' : paymentRemaining > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                                    <span>Remaining</span>
                                    <span>{formatCurrency(paymentRemaining)}</span>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Credit Sale toggle */}
                <div className="flex items-center justify-between gap-3 text-sm p-3 rounded bg-gray-50 dark:bg-gray-800">
                    <span>Credit Sale</span>
                    <Toggle
                        checked={isCreditSale}
                        onChange={(checked) => {
                            setIsCreditSale(checked);
                            if (checked && !dueDate) {
                                setDueDate(getDefaultDueDate());
                            }
                        }}
                    />
                </div>

                {/* Mark as Delivered */}
                <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <input
                        type="checkbox"
                        id="markAsDelivered"
                        checked={markAsDelivered}
                        onChange={(e) => setMarkAsDelivered(e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="markAsDelivered" className="cursor-pointer">
                        <span className="font-medium">Mark as Delivered</span>
                        <span className="block text-xs text-gray-500">
                            Submit order and mark as complete
                        </span>
                    </label>
                </div>

                {/* Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || (isCreditSale ? !dueDate : (hasInvalidPayments || !isPaymentBalanced))}
                    >
                        {isSubmitting ? 'Processing...' : isCreditSale ? 'Confirm Credit Sale' : 'Complete Payment'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PaymentModal;
