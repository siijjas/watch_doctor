import React, { useState, useEffect, useMemo } from 'react';
import * as apiService from '../services/apiService';
import type { POSItem, POSCustomer, CartItem, POSDraft } from '../services/apiService';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

interface POSProps {
    onBack?: () => void;
}

const POS: React.FC<POSProps> = ({ onBack }) => {
    const [items, setItems] = useState<POSItem[]>([]);
    const [customers, setCustomers] = useState<POSCustomer[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [paymentModes, setPaymentModes] = useState<any[]>([]);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [editingItemCode, setEditingItemCode] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');

    // Draft management
    const [drafts, setDrafts] = useState<POSDraft[]>([]);
    const [showDrafts, setShowDrafts] = useState(false);
    const [currentDraftName, setCurrentDraftName] = useState<string | null>(null);

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPaymentMode, setSelectedPaymentMode] = useState('Cash');
    const [discountPercent, setDiscountPercent] = useState(0);
    const [discountAmountInput, setDiscountAmountInput] = useState(0);
    const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
    const [isProcessing, setIsProcessing] = useState(false);

    // Return invoice
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnInvoiceSearch, setReturnInvoiceSearch] = useState('');

    // Toast notifications
    const { showToast, ToastComponent } = useToast();

    // Load initial data
    useEffect(() => {
        loadItems();
        loadCustomers();
        loadPaymentModes();
        loadDrafts();
    }, []);

    const loadItems = async (search: string = '') => {
        setIsLoading(true);
        try {
            const data = await apiService.getPosItems(search);
            setItems(data);
        } catch (error) {
            console.error('Failed to load items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadCustomers = async (search: string = '') => {
        try {
            const data = await apiService.getPosCustomers(search);
            setCustomers(data);
        } catch (error) {
            console.error('Failed to load customers:', error);
        }
    };

    const loadPaymentModes = async () => {
        try {
            const modes = await apiService.getPaymentModes();
            setPaymentModes(modes);
            if (modes.length > 0) {
                setSelectedPaymentMode(modes[0].mode_of_payment || modes[0].name || 'Cash');
            }
        } catch (error) {
            console.error('Failed to load payment modes:', error);
        }
    };

    const loadDrafts = async () => {
        try {
            const data = await apiService.getPosDrafts();
            setDrafts(data);
        } catch (error) {
            console.error('Failed to load drafts:', error);
        }
    };

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            loadItems(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadCustomers(customerSearch);
        }, 300);
        return () => clearTimeout(timer);
    }, [customerSearch]);

    // Cart calculations
    const cartSubtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.rate * item.qty), 0);
    }, [cart]);

    const discountAmount = useMemo(() => {
        if (discountType === 'percent') {
            return cartSubtotal * (discountPercent / 100);
        } else {
            return Math.min(discountAmountInput, cartSubtotal);
        }
    }, [cartSubtotal, discountPercent, discountAmountInput, discountType]);

    const effectiveDiscountPercent = useMemo(() => {
        if (discountType === 'percent') {
            return discountPercent;
        } else {
            return cartSubtotal > 0 ? (discountAmountInput / cartSubtotal) * 100 : 0;
        }
    }, [cartSubtotal, discountPercent, discountAmountInput, discountType]);

    const cartTotal = useMemo(() => {
        return cartSubtotal - discountAmount;
    }, [cartSubtotal, discountAmount]);

    const cartItemCount = useMemo(() => {
        return cart.reduce((sum, item) => sum + item.qty, 0);
    }, [cart]);

    // Cart functions
    const addToCart = (item: POSItem) => {
        setCart(prev => {
            const existing = prev.find(c => c.item_code === item.name);
            if (existing) {
                return prev.map(c =>
                    c.item_code === item.name
                        ? { ...c, qty: c.qty + 1 }
                        : c
                );
            }
            return [...prev, {
                item_code: item.name,
                item_name: item.item_name,
                qty: 1,
                rate: item.standard_rate || 0
            }];
        });
    };

    const updateCartQty = (itemCode: string, delta: number) => {
        setCart(prev => {
            return prev.map(c => {
                if (c.item_code === itemCode) {
                    const newQty = c.qty + delta;
                    return newQty > 0 ? { ...c, qty: newQty } : c;
                }
                return c;
            }).filter(c => c.qty > 0);
        });
    };

    const updateCartPrice = (itemCode: string, newPrice: number) => {
        setCart(prev => prev.map(c =>
            c.item_code === itemCode ? { ...c, rate: newPrice } : c
        ));
    };

    const removeFromCart = (itemCode: string) => {
        setCart(prev => prev.filter(c => c.item_code !== itemCode));
    };

    const clearCart = () => {
        setCart([]);
        setSelectedCustomer(null);
        setCurrentDraftName(null);
        setDiscountPercent(0);
        setDiscountAmountInput(0);
        setDiscountType('percent');
    };

    // Draft functions
    const handleSaveDraft = async () => {
        if (!selectedCustomer) {
            showToast('Please select a customer', 'error');
            return;
        }
        if (cart.length === 0) {
            showToast('Cart is empty', 'error');
            return;
        }

        try {
            const result = await apiService.savePosDraft(selectedCustomer.name, cart);
            showToast(`Order held as ${result.invoice_name}`, 'success');
            clearCart();
            loadDrafts();
        } catch (error: any) {
            showToast(`Failed to save draft: ${error.message}`, 'error');
        }
    };

    const handleLoadDraft = async (draft: POSDraft) => {
        try {
            const data = await apiService.loadPosDraft(draft.name);
            setCart(data.items);
            setSelectedCustomer({ name: data.customer, customer_name: data.customer_name });
            setCurrentDraftName(data.invoice_name);
            setShowDrafts(false);
        } catch (error: any) {
            showToast(`Failed to load draft: ${error.message}`, 'error');
        }
    };

    const handleDeleteDraft = async (draftName: string) => {
        if (!confirm('Delete this held order?')) return;
        try {
            await apiService.deletePosDraft(draftName);
            loadDrafts();
        } catch (error: any) {
            showToast(`Failed to delete draft: ${error.message}`, 'error');
        }
    };

    // Payment functions
    const handleOpenPayment = () => {
        if (!selectedCustomer) {
            showToast('Please select a customer', 'error');
            return;
        }
        if (cart.length === 0) {
            showToast('Cart is empty', 'error');
            return;
        }
        setShowPaymentModal(true);
    };

    const handleConfirmPayment = async () => {
        setIsProcessing(true);
        try {
            let result;
            if (currentDraftName) {
                // Submit existing draft
                result = await apiService.submitPosDraft(currentDraftName, selectedPaymentMode, effectiveDiscountPercent);
            } else {
                // Create new invoice
                result = await apiService.createPosInvoice(
                    selectedCustomer!.name,
                    cart,
                    selectedPaymentMode,
                    effectiveDiscountPercent
                );
            }
            showToast(`Invoice ${result.invoice_name} created! Total: €${result.grand_total.toFixed(2)}`, 'success');
            clearCart();
            setShowPaymentModal(false);
            loadDrafts();
        } catch (error: any) {
            showToast(`Payment failed: ${error.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* Toast Notification */}
            {ToastComponent}
            {/* Top Bar */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-4">
                    {onBack && (
                        <Button variant="ghost" onClick={onBack} className="text-sm">
                            ← Back
                        </Button>
                    )}
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Point of Sale</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowReturnModal(true)}
                        className="text-sm"
                    >
                        ↩️ Return
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => { loadDrafts(); setShowDrafts(true); }}
                        className="text-sm"
                    >
                        📋 Held ({drafts.length})
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Items List */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Search */}
                    <div className="p-4 shrink-0">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="Search items..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="flex-1 overflow-auto px-4 pb-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-32">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">No items in stock</div>
                        ) : (
                            <div className="space-y-2">
                                {items.map(item => (
                                    <div
                                        key={item.name}
                                        onClick={() => addToCart(item)}
                                        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-between"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                                                {item.image ? (
                                                    <img src={item.image} alt="" className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <span className="text-xl">📦</span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-gray-900 dark:text-white text-sm">{item.item_name}</h3>
                                                <p className="text-xs text-gray-500">{item.item_code}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-green-600 dark:text-green-400">€{(item.standard_rate || 0).toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">{item.stock_qty} in stock</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Cart */}
                <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
                    {/* Customer Selection */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Customer</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search customer..."
                                value={selectedCustomer ? selectedCustomer.customer_name : customerSearch}
                                onChange={(e) => {
                                    setCustomerSearch(e.target.value);
                                    setSelectedCustomer(null);
                                    setShowCustomerDropdown(true);
                                }}
                                onFocus={() => setShowCustomerDropdown(true)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm"
                            />
                            {showCustomerDropdown && customers.length > 0 && !selectedCustomer && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                                    {customers.map(customer => (
                                        <div
                                            key={customer.name}
                                            onClick={() => {
                                                setSelectedCustomer(customer);
                                                setShowCustomerDropdown(false);
                                                setCustomerSearch('');
                                            }}
                                            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
                                        >
                                            {customer.customer_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 overflow-auto p-4">
                        {cart.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <span className="text-3xl block mb-2">🛒</span>
                                <p className="text-sm">Cart is empty</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cart.map(item => (
                                    <div key={item.item_code} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium text-gray-900 dark:text-white text-sm flex-1 pr-2">{item.item_name}</h4>
                                            <button onClick={() => removeFromCart(item.item_code)} className="text-red-500 text-xs hover:text-red-700">✕</button>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center space-x-2">
                                                <button
                                                    onClick={() => updateCartQty(item.item_code, -1)}
                                                    className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm"
                                                >−</button>
                                                <span className="w-6 text-center text-sm">{item.qty}</span>
                                                <button
                                                    onClick={() => updateCartQty(item.item_code, 1)}
                                                    className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm"
                                                >+</button>
                                            </div>
                                            {/* Editable Unit Price */}
                                            <div className="text-right">
                                                {editingItemCode === item.item_code ? (
                                                    <input
                                                        type="number"
                                                        value={editingPrice}
                                                        onChange={(e) => setEditingPrice(e.target.value)}
                                                        onBlur={() => {
                                                            updateCartPrice(item.item_code, parseFloat(editingPrice) || 0);
                                                            setEditingItemCode(null);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                updateCartPrice(item.item_code, parseFloat(editingPrice) || 0);
                                                                setEditingItemCode(null);
                                                            }
                                                        }}
                                                        autoFocus
                                                        className="w-20 px-2 py-1 text-right text-sm border rounded"
                                                    />
                                                ) : (
                                                    <div
                                                        onClick={() => {
                                                            setEditingItemCode(item.item_code);
                                                            setEditingPrice(item.rate.toString());
                                                        }}
                                                        className="cursor-pointer group"
                                                        title="Click to edit unit price"
                                                    >
                                                        <div className="flex items-center justify-end space-x-1">
                                                            <span className="text-xs text-gray-500">€{item.rate.toFixed(2)}</span>
                                                            <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100">✏️</span>
                                                        </div>
                                                        <p className="font-bold text-green-600 text-sm">€{(item.rate * item.qty).toFixed(2)}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cart Footer */}
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 shrink-0 bg-gray-50 dark:bg-gray-900">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                            <span className="font-medium">€{cartSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-lg font-bold text-gray-800 dark:text-white">Total</span>
                            <span className="text-2xl font-bold text-green-600">€{cartTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex space-x-2">
                            <Button
                                variant="outline"
                                onClick={handleSaveDraft}
                                disabled={cart.length === 0 || !selectedCustomer}
                                className="flex-1 py-3"
                            >
                                Hold
                            </Button>
                            <Button
                                onClick={handleOpenPayment}
                                disabled={cart.length === 0 || !selectedCustomer}
                                className="flex-1 py-3 bg-green-600 hover:bg-green-700"
                            >
                                Pay
                            </Button>
                        </div>
                        {cart.length > 0 && (
                            <button onClick={clearCart} className="w-full text-center text-sm text-red-500 mt-2 hover:underline">
                                Clear Cart
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Complete Payment</h2>

                        <div className="space-y-4">
                            {/* Payment Mode */}
                            <div>
                                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">Payment Method</label>
                                <select
                                    value={selectedPaymentMode}
                                    onChange={(e) => setSelectedPaymentMode(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                >
                                    {paymentModes.map(mode => (
                                        <option key={mode.mode_of_payment || mode.name} value={mode.mode_of_payment || mode.name}>
                                            {mode.mode_of_payment || mode.name}
                                        </option>
                                    ))}
                                    {paymentModes.length === 0 && <option value="Cash">Cash</option>}
                                </select>
                            </div>

                            {/* Discount */}
                            <div>
                                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">Discount</label>
                                <div className="flex space-x-2">
                                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                        <button
                                            onClick={() => setDiscountType('percent')}
                                            className={`px-3 py-1 rounded text-sm ${discountType === 'percent' ? 'bg-white dark:bg-gray-600 shadow' : ''}`}
                                        >%</button>
                                        <button
                                            onClick={() => setDiscountType('amount')}
                                            className={`px-3 py-1 rounded text-sm ${discountType === 'amount' ? 'bg-white dark:bg-gray-600 shadow' : ''}`}
                                        >€</button>
                                    </div>
                                    {discountType === 'percent' ? (
                                        <input
                                            type="number"
                                            value={discountPercent}
                                            onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            max="100"
                                            placeholder="0"
                                            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                        />
                                    ) : (
                                        <input
                                            type="number"
                                            value={discountAmountInput}
                                            onChange={(e) => setDiscountAmountInput(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            max={cartSubtotal}
                                            placeholder="0.00"
                                            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                                    <span>€{cartSubtotal.toFixed(2)}</span>
                                </div>
                                {discountAmount > 0 && (
                                    <div className="flex justify-between mb-2 text-red-500">
                                        <span>Discount {discountType === 'percent' ? `(${discountPercent}%)` : ''}</span>
                                        <span>-€{discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-600">
                                    <span>Total</span>
                                    <span className="text-green-600">€{cartTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmPayment}
                                disabled={isProcessing}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                                {isProcessing ? 'Processing...' : `Pay €${cartTotal.toFixed(2)}`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drafts Modal */}
            {showDrafts && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Held Orders</h2>
                            <button onClick={() => setShowDrafts(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        <div className="flex-1 overflow-auto">
                            {drafts.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No held orders</p>
                            ) : (
                                <div className="space-y-2">
                                    {drafts.map(draft => (
                                        <div key={draft.name} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">{draft.name}</p>
                                                <p className="text-sm text-gray-500">{draft.customer_name} • {draft.item_count} items</p>
                                                <p className="text-sm font-bold text-green-600">€{(draft.grand_total || 0).toFixed(2)}</p>
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => handleLoadDraft(draft)}>
                                                    Load
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDeleteDraft(draft.name)} className="text-red-500">
                                                    🗑️
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Return Invoice Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">↩️ Return Invoice</h2>
                            <button onClick={() => setShowReturnModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">Invoice Number</label>
                                <input
                                    type="text"
                                    value={returnInvoiceSearch}
                                    onChange={(e) => setReturnInvoiceSearch(e.target.value)}
                                    placeholder="e.g. ACC-SINV-2025-00001"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                                />
                            </div>

                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <strong>Note:</strong> To process a return, enter the original invoice number.
                                    This will create a Credit Note to reverse the sale.
                                </p>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <Button variant="outline" onClick={() => setShowReturnModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    if (returnInvoiceSearch) {
                                        // Open ERPNext return invoice page
                                        window.open(`/app/sales-invoice/${returnInvoiceSearch}`, '_blank');
                                        setShowReturnModal(false);
                                        setReturnInvoiceSearch('');
                                    } else {
                                        showToast('Please enter an invoice number', 'error');
                                    }
                                }}
                                className="flex-1 bg-orange-500 hover:bg-orange-600"
                            >
                                Open Invoice
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;
