import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import * as apiService from '../services/apiService';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    repairOrderName: string;
    invoiceName: string;
    invoiceAmount: number;
    onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
    isOpen,
    onClose,
    repairOrderName,
    invoiceName,
    invoiceAmount,
    onSuccess
}) => {
    const [discount, setDiscount] = useState<number>(0);
    const [paymentMode, setPaymentMode] = useState<string>('Cash');
    const [markAsDelivered, setMarkAsDelivered] = useState<boolean>(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentModes, setPaymentModes] = useState<Array<{ name: string; type: string }>>([]);
    const [isLoadingModes, setIsLoadingModes] = useState(true);

    // Fetch payment modes on mount
    React.useEffect(() => {
        const fetchPaymentModes = async () => {
            try {
                const modes = await apiService.getPaymentModes();

                // Use fetched modes if available, otherwise use fallback
                if (modes && modes.length > 0) {
                    setPaymentModes(modes);
                    setPaymentMode(modes[0].name); // Set first mode as default
                } else {
                    // Fallback to default modes if config is empty
                    const fallbackModes = [
                        { name: 'Cash', type: 'Cash' },
                        { name: 'Credit Card', type: 'Bank' }
                    ];
                    setPaymentModes(fallbackModes);
                    setPaymentMode(fallbackModes[0].name);
                }
            } catch (error) {
                console.error('Failed to fetch payment modes:', error);
                // Fallback to default modes on error
                const fallbackModes = [
                    { name: 'Cash', type: 'Cash' },
                    { name: 'Credit Card', type: 'Bank' }
                ];
                setPaymentModes(fallbackModes);
                setPaymentMode(fallbackModes[0].name);
            } finally {
                setIsLoadingModes(false);
            }
        };

        if (isOpen) {
            fetchPaymentModes();
        }
    }, [isOpen]);

    const finalAmount = invoiceAmount - discount;

    const handleSubmit = async () => {
        if (discount > invoiceAmount) {
            alert('Discount cannot be greater than invoice amount');
            return;
        }

        setIsSubmitting(true);
        try {
            await apiService.finalizeInvoice(
                repairOrderName,
                invoiceName,
                discount,
                paymentMode,
                markAsDelivered
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
                    <span className="text-lg font-bold text-blue-600">${invoiceAmount.toFixed(2)}</span>
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
                        ${finalAmount.toFixed(2)}
                    </span>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium mb-2">Payment Mode</label>
                    {isLoadingModes ? (
                        <div className="text-center py-4 text-gray-500">Loading payment modes...</div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {paymentModes.map((mode) => (
                                <button
                                    key={mode.name}
                                    type="button"
                                    onClick={() => setPaymentMode(mode.name)}
                                    className={`p-3 rounded border-2 text-sm font-medium transition-all ${paymentMode === mode.name
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
                    )}
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
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Processing...' : 'Complete Payment'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PaymentModal;
