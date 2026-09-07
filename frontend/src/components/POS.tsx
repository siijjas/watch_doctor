import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as apiService from '../services/apiService';
import type { POSItem, POSCustomer, CartItem, POSDraft, POSPaymentSplit, POSRuntimeConfig, POSOptions } from '../services/apiService';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Toggle } from './ui/Toggle';
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
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSearchedQueryRef = useRef('');
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
    const [isCreditSale, setIsCreditSale] = useState(false);
    const [creditDueDate, setCreditDueDate] = useState('');
    const [isSplitPayment, setIsSplitPayment] = useState(false);

    // Collect payment (settle outstanding/credit invoices)
    const [showCollectModal, setShowCollectModal] = useState(false);
    const [collectSearch, setCollectSearch] = useState('');
    const [outstandingInvoices, setOutstandingInvoices] = useState<apiService.POSOutstandingInvoice[]>([]);
    const [collectingInvoice, setCollectingInvoice] = useState<apiService.POSOutstandingInvoice | null>(null);
    const [collectAmount, setCollectAmount] = useState(0);
    const [collectMode, setCollectMode] = useState('Cash');
    const [isCollecting, setIsCollecting] = useState(false);

    // Return invoice
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnInvoiceSearch, setReturnInvoiceSearch] = useState('');
    const [returnCandidates, setReturnCandidates] = useState<apiService.POSReturnCandidate[]>([]);
    const [returnDetail, setReturnDetail] = useState<apiService.POSInvoiceReturnDetail | null>(null);
    const [returnQtyMap, setReturnQtyMap] = useState<Record<string, number>>({});
    const [returnRefundMode, setReturnRefundMode] = useState('Cash');
    const [returnRefundAmount, setReturnRefundAmount] = useState(0);
    const [isLoadingReturnDetail, setIsLoadingReturnDetail] = useState(false);
    const [isProcessingReturn, setIsProcessingReturn] = useState(false);

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

    const loadItems = async (search: string = ''): Promise<POSItem[]> => {
        setIsLoading(true);
        try {
            const data = await apiService.getPosItems(search);
            setItems(data);
            lastSearchedQueryRef.current = search;
            return data;
        } catch (error) {
            console.error('Failed to load items:', error);
            return [];
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
        searchDebounceRef.current = setTimeout(() => {
            loadItems(searchQuery);
        }, 300);
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [searchQuery]);

    // Reset keyboard highlight whenever the result list changes
    useEffect(() => {
        setHighlightedIndex(0);
    }, [items]);

    // Auto-focus the item search box so a barcode scanner (or typing) works immediately
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, items.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
            return;
        }
        if (e.key !== 'Enter') return;

        e.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        let resultItems = items;
        let index = highlightedIndex;

        // If the debounce hasn't caught up yet (e.g. a barcode scanner typing fast
        // and pressing Enter immediately), fetch fresh results before acting.
        if (lastSearchedQueryRef.current !== searchQuery) {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
            resultItems = await loadItems(searchQuery);
            index = 0;
        }

        if (resultItems.length === 0) {
            showToast('No matching item found', 'error');
            return;
        }

        addToCart(resultItems[Math.min(index, resultItems.length - 1)]);
        setSearchQuery('');
        setHighlightedIndex(0);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            loadCustomers(customerSearch);
        }, 300);
        return () => clearTimeout(timer);
    }, [customerSearch]);

    // Collect Payment: search outstanding invoices
    useEffect(() => {
        if (!showCollectModal) return;
        const timer = setTimeout(async () => {
            try {
                const data = await apiService.getPosOutstandingInvoices(collectSearch);
                setOutstandingInvoices(data);
            } catch (error) {
                console.error('Failed to load outstanding invoices:', error);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [collectSearch, showCollectModal]);

    // Return: search original invoices until one is selected
    useEffect(() => {
        if (!showReturnModal || returnDetail) return;
        const timer = setTimeout(async () => {
            try {
                const data = await apiService.getPosReturnCandidates(returnInvoiceSearch);
                setReturnCandidates(data);
            } catch (error) {
                console.error('Failed to search invoices for return:', error);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [returnInvoiceSearch, showReturnModal, returnDetail]);

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
    const selectedPaymentMode = paymentSplits[0]?.mode_of_payment || defaultPaymentMode;

    const handleSelectSingleMode = (mode: string) => {
        setPaymentSplits(prev => [{
            id: prev[0]?.id || `${Date.now()}`,
            mode_of_payment: mode,
            amount: roundCurrencyValue(cartTotal),
        }]);
    };

    const handleSwitchToSplit = () => setIsSplitPayment(true);

    const handleSwitchToSingle = () => {
        setIsSplitPayment(false);
        setPaymentSplits(prev => [{
            id: prev[0]?.id || `${Date.now()}`,
            mode_of_payment: prev[0]?.mode_of_payment || defaultPaymentMode,
            amount: roundCurrencyValue(cartTotal),
        }]);
    };

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
        setIsCreditSale(false);
        const defaultDue = new Date();
        defaultDue.setDate(defaultDue.getDate() + 30);
        setCreditDueDate(defaultDue.toISOString().slice(0, 10));
        setShowPaymentModal(true);
    };

    const handleConfirmCreditSale = async () => {
        const customer = getEffectiveCustomer();
        if (!customer) {
            showToast('Select a customer for the credit sale', 'error');
            return;
        }
        if (currentDraftName) {
            showToast('Credit sale is not available for held orders — start a new sale instead', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const result = await apiService.createPosInvoice(
                customer,
                cart,
                [],
                effectiveDiscountPercent,
                getPosOptions(),
                { isCreditSale: true, dueDate: creditDueDate }
            );
            showToast(
                `Credit sale ${result.invoice_name} created. ${formatCurrency(result.outstanding_amount ?? result.grand_total)} due ${result.due_date}.`,
                'success'
            );
            clearCart();
            setShowPaymentModal(false);
            setIsCreditSale(false);
            loadDrafts();
        } catch (error: any) {
            showToast(`Credit sale failed: ${error.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmPayment = async () => {
        if (isCreditSale) {
            return handleConfirmCreditSale();
        }

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

    // ---- Collect Payment (settle outstanding / credit invoices) ----

    const closeCollectModal = () => {
        setShowCollectModal(false);
        setCollectSearch('');
        setOutstandingInvoices([]);
        setCollectingInvoice(null);
        setCollectAmount(0);
    };

    const handleSelectOutstandingInvoice = (invoice: apiService.POSOutstandingInvoice) => {
        setCollectingInvoice(invoice);
        setCollectAmount(roundCurrencyValue(invoice.outstanding_amount));
        setCollectMode(paymentModes[0]?.mode_of_payment || paymentModes[0]?.name || 'Cash');
    };

    const handleSubmitCollection = async () => {
        if (!collectingInvoice) return;
        const amount = roundCurrencyValue(Number(collectAmount) || 0);
        if (amount <= 0) {
            showToast('Enter a payment amount greater than zero', 'error');
            return;
        }
        if (amount > collectingInvoice.outstanding_amount + amountStep / 2) {
            showToast(`Amount cannot exceed the outstanding balance of ${formatCurrency(collectingInvoice.outstanding_amount)}`, 'error');
            return;
        }

        setIsCollecting(true);
        try {
            const result = await apiService.collectPosPayment(collectingInvoice.name, collectMode, amount);
            showToast(
                result.outstanding_amount > 0
                    ? `Collected ${formatCurrency(amount)}. Remaining balance: ${formatCurrency(result.outstanding_amount)}.`
                    : `Collected ${formatCurrency(amount)}. Invoice ${collectingInvoice.name} is now fully paid.`,
                'success'
            );
            closeCollectModal();
        } catch (error: any) {
            showToast(`Payment collection failed: ${error.message}`, 'error');
        } finally {
            setIsCollecting(false);
        }
    };

    // ---- Sales Return ----

    const closeReturnModal = () => {
        setShowReturnModal(false);
        setReturnInvoiceSearch('');
        setReturnCandidates([]);
        setReturnDetail(null);
        setReturnQtyMap({});
    };

    const handleSelectReturnInvoice = async (invoiceName: string) => {
        setIsLoadingReturnDetail(true);
        try {
            const detail = await apiService.getPosInvoiceReturnItems(invoiceName);
            setReturnDetail(detail);
            setReturnQtyMap({});
            setReturnRefundAmount(0);
            setReturnRefundMode(paymentModes[0]?.mode_of_payment || paymentModes[0]?.name || 'Cash');
        } catch (error: any) {
            showToast(error.message || 'Failed to load invoice items', 'error');
        } finally {
            setIsLoadingReturnDetail(false);
        }
    };

    const returnTotal = useMemo(() => {
        if (!returnDetail) return 0;
        return returnDetail.items.reduce((sum, item) => sum + (returnQtyMap[item.row_name] || 0) * item.rate, 0);
    }, [returnDetail, returnQtyMap]);

    // How much can actually be handed back as cash/card — capped at what was
    // really paid on the original invoice, not just whichever items are picked.
    const maxRefundable = useMemo(() => {
        return roundCurrencyValue(Math.max(0, Math.min(returnTotal, returnDetail?.amount_paid || 0)));
    }, [returnTotal, returnDetail, currencyPrecision]);

    // Default the refund to "give back everything refundable" whenever the
    // selected items (and therefore the cap) change; still editable down from there.
    useEffect(() => {
        setReturnRefundAmount(maxRefundable);
    }, [maxRefundable]);

    const handleSubmitReturn = async () => {
        if (!returnDetail) return;
        const items = returnDetail.items
            .map(item => ({ row_name: item.row_name, qty: returnQtyMap[item.row_name] || 0 }))
            .filter(item => item.qty > 0);

        if (items.length === 0) {
            showToast('Enter a quantity to return for at least one item', 'error');
            return;
        }

        const refundAmount = roundCurrencyValue(Math.min(Math.max(0, returnRefundAmount), maxRefundable));

        setIsProcessingReturn(true);
        try {
            const payments = refundAmount > 0
                ? [{ mode_of_payment: returnRefundMode, amount: refundAmount }]
                : [];
            const result = await apiService.createPosReturn(returnDetail.invoice_name, items, payments);
            const remainder = roundCurrencyValue(returnTotal - refundAmount);
            const message = refundAmount > 0
                ? `Return ${result.return_invoice} created. Refunded ${formatCurrency(result.refunded_amount)}.` +
                  (remainder > 0 ? ` Remaining ${formatCurrency(remainder)} left as account credit.` : '')
                : `Return ${result.return_invoice} created. Customer's account credited ${formatCurrency(Math.abs(result.grand_total))}.`;
            showToast(message, 'success');
            closeReturnModal();
        } catch (error: any) {
            showToast(`Return failed: ${error.message}`, 'error');
        } finally {
            setIsProcessingReturn(false);
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
                        onClick={() => setShowCollectModal(true)}
                        className="text-sm"
                    >
                        💰 Collect Payment
                    </Button>
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
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search items or scan barcode..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
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
                                {items.map((item, index) => (
                                    <div
                                        key={item.name}
                                        onClick={() => addToCart(item)}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                        className="bg-white rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all flex items-center justify-between"
                                        style={{
                                            border: index === highlightedIndex ? '1px solid #C9A961' : '1px solid #F0EEEB',
                                            backgroundColor: index === highlightedIndex ? '#FBF8F2' : '#FFFFFF',
                                        }}
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
                                    placeholder="Search customer by name or mobile..."
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
                                                className="px-4 py-2 hover:bg-stone-50 cursor-pointer text-sm flex items-center justify-between"
                                            >
                                                <span>{customer.customer_name}</span>
                                                {customer.mobile_no && (
                                                    <span className="text-xs text-gray-500 shrink-0 ml-2">{customer.mobile_no}</span>
                                                )}
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

                            {isCreditSale ? (
                                <div>
                                    <label className="text-sm text-gray-600 block mb-2">Payment Due Date</label>
                                    <input
                                        type="date"
                                        value={creditDueDate}
                                        onChange={(e) => setCreditDueDate(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl bg-white text-sm"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        The full amount will be recorded as an outstanding balance for {selectedCustomer?.customer_name || 'the selected customer'},
                                        collectible later from "Collect Payment".
                                    </p>
                                </div>
                            ) : !isSplitPayment ? (
                                /* Single Payment Mode */
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm text-gray-600 block">Payment Mode</label>
                                        <button onClick={handleSwitchToSplit} className="text-xs font-medium" style={{ color: '#648DDA' }}>
                                            Split into multiple methods
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {paymentModes.map(mode => {
                                            const modeValue = mode.mode_of_payment || mode.name;
                                            return (
                                                <button
                                                    key={modeValue}
                                                    onClick={() => handleSelectSingleMode(modeValue)}
                                                    className="p-3 rounded-xl border-2 text-sm font-medium transition-all"
                                                    style={selectedPaymentMode === modeValue
                                                        ? { borderColor: '#648DDA', backgroundColor: '#EEF2FC', color: '#3E5FA6' }
                                                        : { borderColor: '#E8E8E8' }}
                                                >
                                                    {mode.type === 'Cash' && '💵 '}
                                                    {mode.type === 'Bank' && '💳 '}
                                                    {mode.type === 'General' && '📝 '}
                                                    {modeValue}
                                                </button>
                                            );
                                        })}
                                        {paymentModes.length === 0 && (
                                            <button
                                                onClick={() => handleSelectSingleMode('Cash')}
                                                className="p-3 rounded-xl border-2 text-sm font-medium"
                                                style={{ borderColor: '#648DDA', backgroundColor: '#EEF2FC', color: '#3E5FA6' }}
                                            >
                                                Cash
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* Payment Splits */
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm text-gray-600 block">Payment Methods</label>
                                        <div className="flex items-center gap-3">
                                            <button onClick={handleSwitchToSingle} className="text-xs font-medium" style={{ color: '#648DDA' }}>
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
                            )}

                            {!currentDraftName && (
                                <div className="flex items-center justify-between gap-3 text-sm text-gray-700 rounded-xl p-3" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                    <span>Credit Sale</span>
                                    <Toggle
                                        checked={isCreditSale}
                                        onChange={(checked) => {
                                            setIsCreditSale(checked);
                                            if (checked && !creditDueDate) {
                                                const date = new Date();
                                                date.setDate(date.getDate() + 15);
                                                setCreditDueDate(date.toISOString().slice(0, 10));
                                            }
                                        }}
                                    />
                                </div>
                            )}

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
                                {!isCreditSale && isSplitPayment && (
                                    <>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-600">Allocated</span>
                                            <span>{formatCurrency(paymentAllocated)}</span>
                                        </div>
                                        <div className={`flex justify-between mb-2 ${paymentRemaining === 0 ? 'text-green-600' : paymentRemaining > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                                            <span>Remaining</span>
                                            <span>{formatCurrency(paymentRemaining)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between font-bold text-lg pt-2" style={{ borderTop: '1px solid #E8E8E8' }}>
                                    <span>{isCreditSale ? 'Outstanding' : 'Total'}</span>
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
                                disabled={isProcessing || (isCreditSale ? !creditDueDate : (hasInvalidPayments || !isPaymentBalanced))}
                                className="flex-1"
                                style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                            >
                                {isProcessing
                                    ? 'Processing...'
                                    : isCreditSale
                                        ? `Confirm Credit Sale — ${formatCurrency(cartTotal)}`
                                        : `Pay ${formatCurrency(cartTotal)}`}
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

            {/* Collect Payment Modal */}
            {showCollectModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[85vh] flex flex-col" style={{ border: '1px solid #F0EEEB' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">💰 Collect Payment</h2>
                            <button onClick={closeCollectModal} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        {!collectingInvoice ? (
                            <>
                                <input
                                    type="text"
                                    value={collectSearch}
                                    onChange={(e) => setCollectSearch(e.target.value)}
                                    placeholder="Search by invoice, customer name, or mobile..."
                                    className="w-full px-4 py-3 rounded-xl bg-white mb-3"
                                    style={{ border: '1px solid #E8E8E8' }}
                                    autoFocus
                                />
                                <div className="flex-1 overflow-auto space-y-2">
                                    {outstandingInvoices.length === 0 ? (
                                        <p className="text-center text-gray-500 py-8">No outstanding invoices found</p>
                                    ) : outstandingInvoices.map(invoice => (
                                        <div
                                            key={invoice.name}
                                            onClick={() => handleSelectOutstandingInvoice(invoice)}
                                            className="rounded-xl p-3 cursor-pointer hover:shadow-sm"
                                            style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}
                                        >
                                            <div className="flex justify-between">
                                                <span className="font-medium text-gray-900 text-sm">{invoice.name}</span>
                                                <span className="font-bold text-amber-600 text-sm">{formatCurrency(invoice.outstanding_amount)}</span>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-xs text-gray-500">{invoice.customer_name} {invoice.mobile_no ? `• ${invoice.mobile_no}` : ''}</span>
                                                <span className="text-xs text-gray-500">Due {invoice.due_date}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-xl p-3" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                    <div className="flex justify-between">
                                        <span className="font-medium text-gray-900">{collectingInvoice.name}</span>
                                        <span className="text-sm text-gray-500">Due {collectingInvoice.due_date}</span>
                                    </div>
                                    <p className="text-sm text-gray-500">{collectingInvoice.customer_name}</p>
                                    <div className="flex justify-between mt-2 font-bold">
                                        <span>Outstanding</span>
                                        <span className="text-amber-600">{formatCurrency(collectingInvoice.outstanding_amount)}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm text-gray-600 block mb-2">Payment Mode</label>
                                    <select
                                        value={collectMode}
                                        onChange={(e) => setCollectMode(e.target.value)}
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
                                </div>

                                <div>
                                    <label className="text-sm text-gray-600 block mb-2">Amount</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max={collectingInvoice.outstanding_amount}
                                        step={amountStep}
                                        value={collectAmount}
                                        onChange={(e) => setCollectAmount(parseFloat(e.target.value) || 0)}
                                        className="w-full px-4 py-2 rounded-xl bg-white"
                                        style={{ border: '1px solid #E8E8E8' }}
                                    />
                                </div>

                                <div className="flex space-x-3">
                                    <Button variant="outline" onClick={() => setCollectingInvoice(null)} className="flex-1">
                                        Back
                                    </Button>
                                    <Button
                                        onClick={handleSubmitCollection}
                                        disabled={isCollecting}
                                        className="flex-1"
                                        style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                                    >
                                        {isCollecting ? 'Processing...' : `Collect ${formatCurrency(collectAmount)}`}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Return Invoice Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[85vh] flex flex-col" style={{ border: '1px solid #F0EEEB' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">↩️ Return Items</h2>
                            <button onClick={closeReturnModal} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        {!returnDetail ? (
                            <>
                                <input
                                    type="text"
                                    value={returnInvoiceSearch}
                                    onChange={(e) => setReturnInvoiceSearch(e.target.value)}
                                    placeholder="Search by invoice, customer name, or mobile..."
                                    className="w-full px-4 py-3 rounded-xl bg-white mb-3"
                                    style={{ border: '1px solid #E8E8E8' }}
                                    autoFocus
                                />
                                <div className="flex-1 overflow-auto space-y-2">
                                    {isLoadingReturnDetail ? (
                                        <div className="flex justify-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                                        </div>
                                    ) : returnCandidates.length === 0 ? (
                                        <p className="text-center text-gray-500 py-8">No matching invoices found</p>
                                    ) : returnCandidates.map(invoice => (
                                        <div
                                            key={invoice.name}
                                            onClick={() => handleSelectReturnInvoice(invoice.name)}
                                            className="rounded-xl p-3 cursor-pointer hover:shadow-sm"
                                            style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}
                                        >
                                            <div className="flex justify-between">
                                                <span className="font-medium text-gray-900 text-sm">{invoice.name}</span>
                                                <span className="font-bold text-green-600 text-sm">{formatCurrency(invoice.grand_total)}</span>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-xs text-gray-500">{invoice.customer_name} {invoice.mobile_no ? `• ${invoice.mobile_no}` : ''}</span>
                                                <span className="text-xs text-gray-500">{invoice.posting_date}{!invoice.is_pos ? ' • Credit Sale' : ''}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 overflow-auto space-y-4">
                                <div className="rounded-xl p-3" style={{ backgroundColor: '#F8F5F1', border: '1px solid #F0EEEB' }}>
                                    <div className="flex justify-between">
                                        <span className="font-medium text-gray-900">{returnDetail.invoice_name}</span>
                                        <span className="text-sm text-gray-500">{returnDetail.posting_date}</span>
                                    </div>
                                    <p className="text-sm text-gray-500">{returnDetail.customer_name}</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm text-gray-600 block">Items to Return</label>
                                    {returnDetail.items.map(item => (
                                        <div key={item.row_name} className="grid grid-cols-[1fr_90px] gap-2 items-center rounded-lg p-2" style={{ border: '1px solid #F0EEEB' }}>
                                            <div>
                                                <p className="text-sm text-gray-900">{item.item_name}</p>
                                                <p className="text-xs text-gray-500">{item.item_code} • {formatCurrency(item.rate)} each • {item.returnable_qty} returnable</p>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                max={item.returnable_qty}
                                                value={returnQtyMap[item.row_name] || 0}
                                                onChange={(e) => {
                                                    const qty = Math.max(0, Math.min(item.returnable_qty, parseFloat(e.target.value) || 0));
                                                    setReturnQtyMap(prev => ({ ...prev, [item.row_name]: qty }));
                                                }}
                                                className="w-full px-2 py-1 rounded-lg bg-white text-sm"
                                                style={{ border: '1px solid #E8E8E8' }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {maxRefundable > 0 ? (
                                    <div>
                                        <label className="text-sm text-gray-600 block mb-2">Refund Via</label>
                                        <select
                                            value={returnRefundMode}
                                            onChange={(e) => setReturnRefundMode(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl bg-white text-sm mb-3"
                                            style={{ border: '1px solid #E8E8E8' }}
                                        >
                                            {paymentModes.map(mode => (
                                                <option key={mode.mode_of_payment || mode.name} value={mode.mode_of_payment || mode.name}>
                                                    {mode.mode_of_payment || mode.name}
                                                </option>
                                            ))}
                                            {paymentModes.length === 0 && <option value="Cash">Cash</option>}
                                        </select>
                                        <label className="text-sm text-gray-600 block mb-2">Refund Amount</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max={maxRefundable}
                                            step={amountStep}
                                            value={returnRefundAmount}
                                            onChange={(e) => setReturnRefundAmount(Math.max(0, Math.min(maxRefundable, parseFloat(e.target.value) || 0)))}
                                            className="w-full px-4 py-2 rounded-xl bg-white"
                                            style={{ border: '1px solid #E8E8E8' }}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Up to {formatCurrency(maxRefundable)} — the amount already paid on this invoice. Lower it to leave some or all as account credit instead.
                                        </p>
                                        <div className="flex justify-between font-bold text-lg pt-3 mt-2" style={{ borderTop: '1px solid #E8E8E8' }}>
                                            <span>Return Total</span>
                                            <span className="text-red-500">{formatCurrency(returnTotal)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                                        <p className="text-sm text-yellow-800">
                                            Nothing has been paid on this invoice yet — no refund is possible. The customer's account
                                            will be credited <strong>{formatCurrency(returnTotal)}</strong>, reducing what they owe.
                                        </p>
                                    </div>
                                )}

                                <div className="flex space-x-3">
                                    <Button variant="outline" onClick={() => setReturnDetail(null)} className="flex-1">
                                        Back
                                    </Button>
                                    <Button
                                        onClick={handleSubmitReturn}
                                        disabled={isProcessingReturn || returnTotal <= 0}
                                        className="flex-1"
                                        style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                                    >
                                        {isProcessingReturn ? 'Processing...' : `Return ${formatCurrency(returnTotal)}`}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default POS;
