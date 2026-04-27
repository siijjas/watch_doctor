import React, { useState, useEffect, useMemo } from 'react';
import * as apiService from '../services/apiService';
import type { POSItem, POSCustomer, CartItem, POSDraft, POSPaymentSplit, POSRuntimeConfig, POSOptions } from '../services/apiService';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { useAppConfig } from '../context/AppConfigContext';

interface POSProps {
    onBack?: () => void;
}

interface PaymentSplit extends POSPaymentSplit {
    id: string;
}

const POS: React.FC<POSProps> = ({ onBack }) => {
    const { formatCurrency, config } = useAppConfig();
    const [items, setItems] = useState<POSItem[]>([]);
    const [customers, setCustomers] = useState<POSCustomer[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
    const [hasInitializedCustomer, setHasInitializedCustomer] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [paymentModes, setPaymentModes] = useState<any[]>([]);
    const [runtimeConfig, setRuntimeConfig] = useState<POSRuntimeConfig | null>(null);
    const [selectedPosProfile, setSelectedPosProfile] = useState('');
    const [selectedSalesPerson, setSelectedSalesPerson] = useState('');
    const [commissionRate, setCommissionRate] = useState(0);
    const [selectedReceiptFormat, setSelectedReceiptFormat] = useState('');
    const [selectedNamingSeries, setSelectedNamingSeries] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showCreateCustomerForm, setShowCreateCustomerForm] = useState(false);
    const [createCustomerData, setCreateCustomerData] = useState({
        customer_name: '',
        customer_id: '',
        mobile_no: '',
        email_id: '',
    });
    const [createCustomerError, setCreateCustomerError] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [editingItemCode, setEditingItemCode] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');

    // Draft management
    const [drafts, setDrafts] = useState<POSDraft[]>([]);
    const [showDrafts, setShowDrafts] = useState(false);
    const [currentDraftName, setCurrentDraftName] = useState<string | null>(null);

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
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
        loadRuntimeConfig();
        loadItems();
        loadCustomers();
        loadPaymentModes();
        loadDrafts();
    }, []);

    useEffect(() => {
        if (!runtimeConfig || hasInitializedCustomer) return;

        if (!selectedCustomer && runtimeConfig.default_customer) {
            setSelectedCustomer({
                name: runtimeConfig.default_customer,
                customer_name: runtimeConfig.default_customer_name || runtimeConfig.default_customer,
            });
        }

        // Default customer should only auto-apply once on initial POS load.
        setHasInitializedCustomer(true);
    }, [runtimeConfig, selectedCustomer, hasInitializedCustomer]);

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

    const loadRuntimeConfig = async () => {
        try {
            const data = await apiService.getPosRuntimeConfig();
            setRuntimeConfig(data);
            setSelectedPosProfile(data.pos_profile || '');
            setSelectedSalesPerson(data.default_sales_person || '');
            setCommissionRate(data.default_commission_rate || 0);
            setSelectedReceiptFormat(data.default_receipt_format || '');
            setSelectedNamingSeries(data.allowed_naming_series?.[0] || '');
        } catch (error) {
            console.error('Failed to load POS runtime config:', error);
        }
    };

    const loadPaymentModes = async () => {
        try {
            const modes = await apiService.getPaymentModes();
            setPaymentModes(modes);
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

    const handleCreateCustomer = async () => {
        const customer_name = createCustomerData.customer_name.trim();
        const customer_id = createCustomerData.customer_id.trim();
        const mobile_no = createCustomerData.mobile_no.trim();
        const email_id = createCustomerData.email_id.trim();

        if (!customer_name) {
            setCreateCustomerError('Customer name is required');
            return;
        }

        setCreateCustomerError('');
        setIsCreatingCustomer(true);
        try {
            const createdCustomer = await apiService.createPosCustomer({
                customer_name,
                customer_id: customer_id || undefined,
                mobile_no: mobile_no || undefined,
                email_id: email_id || undefined,
            });

            setCustomers(prev => {
                const rest = prev.filter(c => c.name !== createdCustomer.name);
                return [createdCustomer, ...rest];
            });
            setSelectedCustomer(createdCustomer);
            setCustomerSearch('');
            setShowCustomerDropdown(false);
            setShowCreateCustomerForm(false);
            setCreateCustomerData({
                customer_name: '',
                customer_id: '',
                mobile_no: '',
                email_id: '',
            });
            showToast(`Customer ${createdCustomer.customer_name} created`, 'success');
        } catch (error: any) {
            const message = error?.message || 'Failed to create customer';
            setCreateCustomerError(message);
        } finally {
            setIsCreatingCustomer(false);
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

    const currencyPrecision = Math.max(0, config.decimalPlaces || 2);
    const amountStep = currencyPrecision > 0 ? 1 / Math.pow(10, currencyPrecision) : 1;

    const roundCurrencyValue = (value: number) => {
        const factor = Math.pow(10, currencyPrecision);
        return Math.round((value + Number.EPSILON) * factor) / factor;
    };

    const defaultPaymentMode = paymentModes[0]?.mode_of_payment || paymentModes[0]?.name || 'Cash';

    const getNextPaymentMode = (existingPayments: PaymentSplit[]) => {
        const availableModes = paymentModes.map(mode => mode.mode_of_payment || mode.name).filter(Boolean);
        if (availableModes.length === 0) return 'Cash';

        const usedModes = new Set(existingPayments.map(payment => payment.mode_of_payment));
        return availableModes.find(mode => !usedModes.has(mode)) || availableModes[existingPayments.length % availableModes.length];
    };

    const paymentAllocated = useMemo(() => {
        return roundCurrencyValue(paymentSplits.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
    }, [paymentSplits, currencyPrecision]);

    const paymentRemaining = useMemo(() => {
        return roundCurrencyValue(cartTotal - paymentAllocated);
    }, [cartTotal, paymentAllocated, currencyPrecision]);

    const hasInvalidPayments = paymentSplits.some(payment => !payment.mode_of_payment || (Number(payment.amount) || 0) <= 0);
    const isPaymentBalanced = Math.abs(paymentRemaining) < amountStep / 2 || paymentRemaining === 0;

    useEffect(() => {
        if (!showPaymentModal) return;
        setPaymentSplits(prev => {
            if (prev.length !== 1) return prev;

            const current = prev[0];
            const nextAmount = roundCurrencyValue(cartTotal);
            const nextMode = current?.mode_of_payment || defaultPaymentMode;

            if (current && current.mode_of_payment === nextMode && Math.abs((current.amount || 0) - nextAmount) < amountStep / 2) {
                return prev;
            }

            return [{
                id: current?.id || `${Date.now()}`,
                mode_of_payment: nextMode,
                amount: nextAmount,
            }];
        });
    }, [showPaymentModal, cartTotal, defaultPaymentMode, amountStep]);

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
        setCurrentDraftName(null);
        setPaymentSplits([]);
        setDiscountPercent(0);
        setDiscountAmountInput(0);
        setDiscountType('percent');
    };

    const getEffectiveCustomer = () => {
        return selectedCustomer?.name || runtimeConfig?.default_customer || '';
    };

    const getPosOptions = (): POSOptions => ({
        pos_profile: selectedPosProfile,
        sales_person: selectedSalesPerson,
        commission_rate: commissionRate,
        receipt_format: selectedReceiptFormat,
        naming_series: selectedNamingSeries,
    });

    // Draft functions
    const handleSaveDraft = async () => {
        if (!getEffectiveCustomer()) {
            showToast('Please select a customer', 'error');
            return;
        }
        if (cart.length === 0) {
            showToast('Cart is empty', 'error');
            return;
        }

        try {
            const result = await apiService.savePosDraft(getEffectiveCustomer(), cart, getPosOptions());
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
            setSelectedPosProfile(data.pos_profile || runtimeConfig?.pos_profile || '');
            setSelectedSalesPerson(data.sales_person || runtimeConfig?.default_sales_person || '');
            setCommissionRate(data.commission_rate || runtimeConfig?.default_commission_rate || 0);
            setSelectedReceiptFormat(data.receipt_format || runtimeConfig?.default_receipt_format || '');
            setSelectedNamingSeries(data.naming_series || runtimeConfig?.allowed_naming_series?.[0] || '');
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
                    amount: roundCurrencyValue(cartTotal),
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
                return [{ ...next[0], amount: roundCurrencyValue(cartTotal) }];
            }
            return next;
        });
    };

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

    const handleOpenPayment = () => {
        if (!getEffectiveCustomer()) {
            showToast('Please select a customer', 'error');
            return;
        }
        if (cart.length === 0) {
            showToast('Cart is empty', 'error');
            return;
        }

        setPaymentSplits([{
            id: `${Date.now()}`,
            mode_of_payment: defaultPaymentMode,
            amount: roundCurrencyValue(cartTotal),
        }]);
        setShowPaymentModal(true);
    };

    const handleConfirmPayment = async () => {
        const normalizedPayments: POSPaymentSplit[] = paymentSplits.map(payment => ({
            mode_of_payment: payment.mode_of_payment,
            amount: roundCurrencyValue(Number(payment.amount) || 0),
        }));

        if (normalizedPayments.length === 0 || normalizedPayments.some(payment => !payment.mode_of_payment || payment.amount <= 0)) {
            showToast('Enter a valid payment mode and amount for each split', 'error');
            return;
        }

        if (!isPaymentBalanced) {
            const message = paymentRemaining > 0
                ? `Remaining to allocate: ${formatCurrency(paymentRemaining)}`
                : `Allocated amount exceeds total by ${formatCurrency(Math.abs(paymentRemaining))}`;
            showToast(message, 'error');
            return;
        }

        setIsProcessing(true);
        try {
            let result;
            if (currentDraftName) {
                result = await apiService.submitPosDraft(currentDraftName, normalizedPayments, effectiveDiscountPercent, getPosOptions());
            } else {
                result = await apiService.createPosInvoice(
                    getEffectiveCustomer(),
                    cart,
                    normalizedPayments,
                    effectiveDiscountPercent,
                    getPosOptions()
                );
            }
            if (result.auto_print && result.print_url) {
                window.open(result.print_url, '_blank', 'noopener,noreferrer');
            }
            showToast(`Invoice ${result.invoice_name} created! Total: ${formatCurrency(result.grand_total)}`, 'success');
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
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#FAF7F2' }}>
            {/* Toast Notification */}
            {ToastComponent}
            {/* Top Bar */}
            <div className="bg-white px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid #F0EEEB' }}>
                <div className="flex items-center space-x-4">
                    {onBack && (
                        <Button variant="ghost" onClick={onBack} className="text-sm">
                            ← Back
                        </Button>
                    )}
                    <h1 className="text-xl font-bold text-gray-900">Point of Sale</h1>
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
                                className="w-full pl-12 pr-4 py-3 rounded-xl bg-white text-gray-900"
                                style={{ border: '1px solid #E8E8E8' }}
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
                                        className="bg-white rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all flex items-center justify-between"
                                        style={{ border: '1px solid #F0EEEB' }}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#F5F1EC' }}>
                                                {item.image ? (
                                                    <img src={item.image} alt="" className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <span className="text-xl">📦</span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-gray-900 text-sm">{item.item_name}</h3>
                                                <p className="text-xs text-gray-500">{item.item_code}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-green-600">{formatCurrency(item.standard_rate || 0)}</p>
                                            <p className="text-xs text-gray-500">{item.stock_qty} in stock</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Cart */}
                <div className="w-96 bg-white flex flex-col shrink-0" style={{ borderLeft: '1px solid #F0EEEB' }}>
                    {/* Customer Selection */}
                    <div className="p-4 shrink-0" style={{ borderBottom: '1px solid #F0EEEB' }}>
                        <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Customer</label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
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
                                    className="w-full px-4 py-2 rounded-lg bg-white text-sm"
                                    style={{ border: '1px solid #E8E8E8' }}
                                />
                                {showCustomerDropdown && customers.length > 0 && !selectedCustomer && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto z-10" style={{ borderColor: '#E8E8E8' }}>
                                        {customers.map(customer => (
                                            <div
                                                key={customer.name}
                                                onClick={() => {
                                                    setSelectedCustomer(customer);
                                                    setShowCustomerDropdown(false);
                                                    setCustomerSearch('');
                                                }}
                                                className="px-4 py-2 hover:bg-stone-50 cursor-pointer text-sm"
                                            >
                                                {customer.customer_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setShowCreateCustomerForm(prev => !prev);
                                    setCreateCustomerError('');
                                }}
                                className="text-xs font-medium shrink-0 px-2"
                                style={{ color: '#648DDA' }}
                                type="button"
                            >
                                {showCreateCustomerForm ? 'Close' : '+ New Customer'}
                            </button>
                        </div>

                        {showCreateCustomerForm && (
                            <div className="mt-3 rounded-lg p-3" style={{ border: '1px solid #E8E8E8', backgroundColor: '#FAF7F2' }}>
                                {createCustomerError && (
                                    <div className="mb-2 text-xs text-red-600">{createCustomerError}</div>
                                )}
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={createCustomerData.customer_name}
                                        onChange={(e) => setCreateCustomerData(prev => ({ ...prev, customer_name: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-white"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="ID"
                                        value={createCustomerData.customer_id}
                                        onChange={(e) => setCreateCustomerData(prev => ({ ...prev, customer_id: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-white"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Mobile"
                                        value={createCustomerData.mobile_no}
                                        onChange={(e) => setCreateCustomerData(prev => ({ ...prev, mobile_no: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-white"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        value={createCustomerData.email_id}
                                        onChange={(e) => setCreateCustomerData(prev => ({ ...prev, email_id: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-white"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                    <Button
                                        onClick={handleCreateCustomer}
                                        disabled={isCreatingCustomer}
                                        className="w-full"
                                        style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                                    >
                                        {isCreatingCustomer ? 'Creating...' : 'Create Customer'}
                                    </Button>
                                </div>
                            </div>
                        )}
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
                                    <div key={item.item_code} className="rounded-lg p-3" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-medium text-gray-900 text-sm flex-1 pr-2">{item.item_name}</h4>
                                            <button onClick={() => removeFromCart(item.item_code)} className="text-red-500 text-xs hover:text-red-700">✕</button>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center space-x-2">
                                                <button
                                                    onClick={() => updateCartQty(item.item_code, -1)}
                                                    className="w-7 h-7 rounded flex items-center justify-center text-sm"
                                                    style={{ backgroundColor: '#E9E4DF' }}
                                                >−</button>
                                                <span className="w-6 text-center text-sm">{item.qty}</span>
                                                <button
                                                    onClick={() => updateCartQty(item.item_code, 1)}
                                                    className="w-7 h-7 rounded flex items-center justify-center text-sm"
                                                    style={{ backgroundColor: '#E9E4DF' }}
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
                                                            <span className="text-xs text-gray-500">{formatCurrency(item.rate)}</span>
                                                            <span className="text-xs opacity-0 group-hover:opacity-100" style={{ color: '#648DDA' }}>✏️</span>
                                                        </div>
                                                        <p className="font-bold text-green-600 text-sm">{formatCurrency(item.rate * item.qty)}</p>
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
                    <div className="p-4 shrink-0 sticky bottom-0 z-10" style={{ borderTop: '1px solid #F0EEEB', backgroundColor: '#F8F5F1' }}>
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-medium">{formatCurrency(cartSubtotal)}</span>
                        </div>
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-lg font-bold text-gray-800">Total</span>
                            <span className="text-2xl font-bold text-green-600">{formatCurrency(cartTotal)}</span>
                        </div>
                        <div className="flex space-x-2">
                            <Button
                                variant="outline"
                                onClick={handleSaveDraft}
                                disabled={cart.length === 0 || !getEffectiveCustomer()}
                                className="flex-1 py-3"
                            >
                                Hold
                            </Button>
                            <Button
                                onClick={handleOpenPayment}
                                disabled={cart.length === 0 || !getEffectiveCustomer()}
                                className="flex-1 py-3"
                                style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" style={{ border: '1px solid #F0EEEB' }}>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Complete Payment</h2>

                        <div className="space-y-4">
                            {/* Payment Splits */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm text-gray-600 block">Payment Methods</label>
                                    <Button variant="outline" size="sm" onClick={addPaymentSplit} className="text-xs">
                                        + Add Split
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {paymentSplits.map((payment, index) => (
                                        <div key={payment.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                                            <select
                                                value={payment.mode_of_payment}
                                                onChange={(e) => updatePaymentSplit(payment.id, 'mode_of_payment', e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-white text-sm"
                                                style={{ border: '1px solid #E8E8E8' }}
                                            >
                                                {paymentModes.map(mode => (
                                                    <option key={mode.mode_of_payment || mode.name} value={mode.mode_of_payment || mode.name}>
                                                        {mode.mode_of_payment || mode.name}
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
                                                className="w-full px-3 py-2 rounded-xl bg-white text-sm"
                                                style={{ border: '1px solid #E8E8E8' }}
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
                                    <p className="text-xs text-gray-500">Split one sale across multiple payment modes.</p>
                                    {Math.abs(paymentRemaining) >= amountStep / 2 && (
                                        <button onClick={autoBalancePayments} className="text-xs font-medium" style={{ color: '#648DDA' }}>
                                            Auto-balance
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Discount */}
                            <div>
                                <label className="text-sm text-gray-600 block mb-2">Discount</label>
                                <div className="flex space-x-2">
                                    <div className="flex rounded-lg p-1" style={{ backgroundColor: '#F0EDEA' }}>
                                        <button
                                            onClick={() => setDiscountType('percent')}
                                            className={`px-3 py-1 rounded text-sm ${discountType === 'percent' ? 'bg-white shadow' : ''}`}
                                        >%</button>
                                        <button
                                            onClick={() => setDiscountType('amount')}
                                            className={`px-3 py-1 rounded text-sm ${discountType === 'amount' ? 'bg-white shadow' : ''}`}
                                        >{config.currencySymbol}</button>
                                    </div>
                                    {discountType === 'percent' ? (
                                        <input
                                            type="number"
                                            value={discountPercent}
                                            onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            max="100"
                                            placeholder="0"
                                            className="flex-1 px-4 py-2 rounded-xl bg-white"
                                            style={{ border: '1px solid #E8E8E8' }}
                                        />
                                    ) : (
                                        <input
                                            type="number"
                                            value={discountAmountInput}
                                            onChange={(e) => setDiscountAmountInput(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            max={cartSubtotal}
                                            placeholder="0.00"
                                            className="flex-1 px-4 py-2 rounded-xl bg-white"
                                            style={{ border: '1px solid #E8E8E8' }}
                                        />
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 block mb-2">Sales Person</label>
                                <select
                                    value={selectedSalesPerson}
                                    onChange={(e) => setSelectedSalesPerson(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-white text-sm"
                                    style={{ border: '1px solid #E8E8E8' }}
                                >
                                    <option value="">Select sales person…</option>
                                    {(runtimeConfig?.sales_persons || []).map(person => (
                                        <option key={person} value={person}>{person}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Summary */}
                            <div className="rounded-xl p-4" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-600">Subtotal</span>
                                    <span>{formatCurrency(cartSubtotal)}</span>
                                </div>
                                {discountAmount > 0 && (
                                    <div className="flex justify-between mb-2 text-red-500">
                                        <span>Discount {discountType === 'percent' ? `(${discountPercent}%)` : ''}</span>
                                        <span>-{formatCurrency(discountAmount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-600">Allocated</span>
                                    <span>{formatCurrency(paymentAllocated)}</span>
                                </div>
                                <div className={`flex justify-between mb-2 ${paymentRemaining === 0 ? 'text-green-600' : paymentRemaining > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                                    <span>Remaining</span>
                                    <span>{formatCurrency(paymentRemaining)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg pt-2" style={{ borderTop: '1px solid #E8E8E8' }}>
                                    <span>Total</span>
                                    <span className="text-green-600">{formatCurrency(cartTotal)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmPayment}
                                disabled={isProcessing || hasInvalidPayments || !isPaymentBalanced}
                                className="flex-1"
                                style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                            >
                                {isProcessing ? 'Processing...' : `Pay ${formatCurrency(cartTotal)}`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drafts Modal */}
            {showDrafts && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col" style={{ border: '1px solid #F0EEEB' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Held Orders</h2>
                            <button onClick={() => setShowDrafts(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        <div className="flex-1 overflow-auto">
                            {drafts.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No held orders</p>
                            ) : (
                                <div className="space-y-2">
                                    {drafts.map(draft => (
                                        <div key={draft.name} className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                            <div>
                                                <p className="font-medium text-gray-900">{draft.name}</p>
                                                <p className="text-sm text-gray-500">{draft.customer_name} • {draft.item_count} items</p>
                                                <p className="text-sm font-bold text-green-600">{formatCurrency(draft.grand_total || 0)}</p>
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" style={{ border: '1px solid #F0EEEB' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">↩️ Return Invoice</h2>
                            <button onClick={() => setShowReturnModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-600 block mb-2">Invoice Number</label>
                                <input
                                    type="text"
                                    value={returnInvoiceSearch}
                                    onChange={(e) => setReturnInvoiceSearch(e.target.value)}
                                    placeholder="e.g. ACC-SINV-2025-00001"
                                    className="w-full px-4 py-3 rounded-xl bg-white"
                                    style={{ border: '1px solid #E8E8E8' }}
                                />
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                                <p className="text-sm text-yellow-800">
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
                                className="flex-1"
                                style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
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
