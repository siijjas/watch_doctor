import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RepairOrder } from './types';
import * as apiService from './services/apiService';
import { isErpNext } from './services/apiService';
import { mockRepairOrders } from './services/mockData';
import RepairOrderList from './components/RepairOrderList';
import RepairOrderDetail from './components/RepairOrderDetail';
import { RepairOrderForm } from './components/RepairOrderForm';
import { RepairOrderIntakeWizard } from './components/RepairOrderIntakeWizard';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import DailyReport from './components/DailyReport';
import Settings from './components/Settings';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppConfigProvider } from './context/AppConfigContext';
import { LoginPage } from './components/LoginPage';

type ViewType = 'dashboard' | 'orders' | 'pos' | 'daily-report' | 'settings';
const ORDER_PAGE_SIZE = 100;

// Main app content (shown when authenticated)
const AppContent: React.FC = () => {
  const { user, logout, hasRole } = useAuth();

  // Determine default view based on role
  const getDefaultView = (): ViewType => {
    if (hasRole('executive')) return 'dashboard';
    return 'orders'; // Data Entry and Technicians land on orders
  };

  const [currentView, setCurrentView] = useState<ViewType>(getDefaultView());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [repairOrders, setRepairOrders] = useState<RepairOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<RepairOrder | null | undefined>(undefined);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [debouncedOrderSearchQuery, setDebouncedOrderSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [orderTotalCount, setOrderTotalCount] = useState(0);
  const latestOrdersRequestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedOrderSearchQuery(orderSearchQuery);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [orderSearchQuery]);

  const loadOrders = useCallback(async () => {
    const requestId = ++latestOrdersRequestRef.current;
    setIsLoading(true);
    try {
      if (isErpNext) {
        const response = await apiService.getRepairOrders(0, ORDER_PAGE_SIZE, debouncedOrderSearchQuery, orderStatusFilter, true);
        if (requestId !== latestOrdersRequestRef.current) {
          return;
        }
        setRepairOrders(response.orders as RepairOrder[]);
        setOrderTotalCount(response.total_count || 0);
        setHasMoreOrders(response.orders.length < response.total_count);
      } else {
        setRepairOrders(mockRepairOrders as RepairOrder[]);
        setOrderTotalCount(mockRepairOrders.length);
        setHasMoreOrders(false);
      }
    } catch (error) {
      console.error("Failed to load repair orders:", error);
      setRepairOrders(mockRepairOrders as RepairOrder[]);
      setOrderTotalCount(mockRepairOrders.length);
      setHasMoreOrders(false);
    } finally {
      if (requestId === latestOrdersRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedOrderSearchQuery, orderStatusFilter]);

  const loadMoreOrders = useCallback(async () => {
    if (!isErpNext || isLoadingMoreOrders || !hasMoreOrders) {
      return;
    }

    const requestId = ++latestOrdersRequestRef.current;
    setIsLoadingMoreOrders(true);
    try {
      const currentLoaded = repairOrders.length;
      const response = await apiService.getRepairOrders(
        repairOrders.length,
        ORDER_PAGE_SIZE,
        debouncedOrderSearchQuery,
        orderStatusFilter,
        true,
      );
      if (requestId !== latestOrdersRequestRef.current) {
        return;
      }
      setRepairOrders(prev => [...prev, ...(response.orders as RepairOrder[])]);
      setOrderTotalCount(response.total_count || currentLoaded + response.orders.length);
      setHasMoreOrders(currentLoaded + response.orders.length < response.total_count);
    } catch (error) {
      console.error("Failed to load more repair orders:", error);
    } finally {
      if (requestId === latestOrdersRequestRef.current) {
        setIsLoadingMoreOrders(false);
      }
    }
  }, [debouncedOrderSearchQuery, hasMoreOrders, isLoadingMoreOrders, orderStatusFilter, repairOrders.length]);

  useEffect(() => {
    if (currentView === 'orders') {
      loadOrders();
    } else {
      setIsLoading(false);
    }
  }, [currentView, loadOrders]);

  const handleSelectOrder = useCallback(async (orderSummary: RepairOrder) => {
    if (isErpNext) {
      setIsLoading(true);
      const fullOrder = await apiService.getRepairOrder(orderSummary.name);
      setSelectedOrder(fullOrder);
      setIsLoading(false);
    } else {
      setSelectedOrder(orderSummary);
    }
  }, []);

  const handleSelectOrderById = useCallback(async (orderId: string) => {
    setIsLoading(true);
    try {
      if (isErpNext) {
        const fullOrder = await apiService.getRepairOrder(orderId);
        setSelectedOrder(fullOrder);
      } else {
        const order = repairOrders.find(o => o.name === orderId) || null;
        setSelectedOrder(order);
      }
      setCurrentView('orders');
    } catch (error) {
      console.error("Failed to select order:", error);
    } finally {
      setIsLoading(false);
    }
  }, [repairOrders]);

  const handleBackToList = useCallback(() => {
    setSelectedOrder(null);
    loadOrders();
  }, [loadOrders]);

  const handleOpenForm = useCallback((order?: RepairOrder | null) => {
    setOrderToEdit(order ?? undefined);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setOrderToEdit(undefined);
  }, []);

  const handleSaveOrder = useCallback(async (order: RepairOrder) => {
    try {
      if (isErpNext) {
        const savedOrder = await apiService.saveRepairOrder(order);
        handleCloseForm();
        await loadOrders();
        setSelectedOrder(savedOrder as RepairOrder);
      } else {
        if (order.name) {
          setRepairOrders(prev => prev.map(o => o.name === order.name ? order : o));
        } else {
          const now = new Date();
          const yy = String(now.getFullYear()).slice(-2);
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
          const newOrder = { ...order, name: `${yy}${mm}${seq}` };
          setRepairOrders(prev => [...prev, newOrder]);
        }
        handleCloseForm();
      }
    } catch (error) {
      console.error("Failed to save order:", error);
    }
  }, [loadOrders, handleCloseForm]);

  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (isErpNext) {
      await apiService.deleteRepairOrder(orderId);
      loadOrders();
    } else {
      setRepairOrders(prev => prev.filter(o => o.name !== orderId));
    }
    setSelectedOrder(null);
  }, [loadOrders]);

  const handleRefreshOrder = useCallback(async (orderId: string) => {
    if (isErpNext) {
      const refreshedOrder = await apiService.getRepairOrder(orderId);
      setSelectedOrder(refreshedOrder);
    }
  }, []);

  const handleNavigateToOrders = useCallback((filter?: string, search?: string) => {
    const nextStatus = filter || 'All';
    const nextSearch = search || '';
    setOrderStatusFilter(nextStatus);
    setOrderSearchQuery(nextSearch);
    setDebouncedOrderSearchQuery(nextSearch);
    setCurrentView('orders');
  }, []);

  // Tab button component
  const TabButton: React.FC<{ view: ViewType; icon: React.ReactNode; label: string }> = ({ view, icon, label }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSelectedOrder(null);
        if (view === 'orders') {
          setOrderStatusFilter('All');
          setOrderSearchQuery('');
          setDebouncedOrderSearchQuery('');
        }
      }}
      className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all duration-200 ${currentView === view
        ? 'bg-blue-500 text-white shadow-md'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
    >
      {icon}
      <span className="ml-2">{label}</span>
    </button>
  );

  // POS Icon
  const POSIcon = () => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      <Sidebar
        currentView={currentView}
        onChangeView={(view) => {
          setCurrentView(view);
          setSelectedOrder(null);
        }}
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-[240px]">
        <Header
          title={currentView === 'dashboard' ? 'Dashboard' : currentView === 'pos' ? 'POS' : currentView === 'daily-report' ? 'Reports' : currentView === 'settings' ? 'Settings' : 'Repair Orders'}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        />

        <main className={currentView === 'pos' ? 'flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8'}>
          {currentView === 'orders' && !selectedOrder && hasRole('executive', 'data_entry') && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => handleOpenForm()}
                className="font-semibold py-2.5 px-5 rounded-xl shadow-sm transition duration-200 flex items-center text-sm hover:opacity-90"
                style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
              >
                <span className="mr-2">+</span> New Order
              </button>
            </div>
          )}

          {currentView === 'dashboard' && hasRole('executive', 'data_entry') ? (
            <Dashboard
              onNavigateToOrders={handleNavigateToOrders}
              onSelectOrder={handleSelectOrderById}
            />
          ) : currentView === 'pos' && hasRole('executive', 'data_entry') ? (
            <POS onBack={() => setCurrentView(getDefaultView())} />
          ) : currentView === 'daily-report' && hasRole('executive', 'data_entry') ? (
            <DailyReport onSelectOrder={handleSelectOrderById} />
          ) : currentView === 'settings' && hasRole('executive') ? (
            <Settings />
          ) : selectedOrder ? (
            <RepairOrderDetail order={selectedOrder} onBack={handleBackToList} onEdit={hasRole('executive', 'data_entry', 'technician') ? handleOpenForm : undefined} onDelete={hasRole('executive') ? handleDeleteOrder : undefined} onRefresh={handleRefreshOrder} />
          ) : (
            <RepairOrderList
              orders={repairOrders}
              onSelectOrder={handleSelectOrder}
              searchQuery={orderSearchQuery}
              statusFilter={orderStatusFilter}
              onSearchQueryChange={setOrderSearchQuery}
              onStatusFilterChange={setOrderStatusFilter}
              serverSideSearch={isErpNext}
              totalOrdersCount={orderTotalCount}
              onLoadMore={loadMoreOrders}
              hasMoreOrders={hasMoreOrders}
              isLoadingMoreOrders={isLoadingMoreOrders}
            />
          )}
        </main>
      </div>

      {isFormOpen && (
        orderToEdit ? (
          <RepairOrderForm
            isOpen={isFormOpen}
            onClose={handleCloseForm}
            onSave={handleSaveOrder}
            order={orderToEdit}
          />
        ) : (
          <RepairOrderIntakeWizard
            isOpen={isFormOpen}
            onClose={handleCloseForm}
            onSave={handleSaveOrder}
          />
        )
      )}
    </div>
  );
};

// App wrapper with auth check
const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AppContent />;
};

// Root component with AuthProvider
const Root: React.FC = () => {
  return (
    <AuthProvider>
      <AppConfigProvider>
        <App />
      </AppConfigProvider>
    </AuthProvider>
  );
};

export default Root;
