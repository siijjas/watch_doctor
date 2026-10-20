import React, { useCallback, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppConfigProvider } from './context/AppConfigContext';
import { LoginPage } from './components/LoginPage';
import { matchPath, navigate, path as buildPath, useLocation } from './router';
import { landingFor } from './design/nav';
import { AppShell, Spinner, ToastProvider } from './design/kit';
import FrontDesk from './screens/FrontDesk';
import OrdersScreen from './screens/OrdersScreen';
import OrderScreen from './screens/OrderScreen';
import Bench from './screens/Bench';
import WatchJob from './screens/WatchJob';
import Intake from './screens/Intake';
import EstimateScreen from './screens/EstimateScreen';
import CollectScreen from './screens/CollectScreen';
import DashboardScreen from './screens/DashboardScreen';
import ReportsScreen, { type ReportId } from './screens/ReportsScreen';
import SettingsScreen from './screens/settings/SettingsScreen';
import PosScreen from './screens/pos/PosScreen';
import PosBackOffice from './screens/pos/PosBackOffice';
import { CustomerScreen, CustomersScreen } from './screens/CustomerScreen';
import type { DWRole } from './types';

const KitGallery = React.lazy(() => import('./design/KitGallery'));

/** Screens addressable by URL (spec B3). Screens not rebuilt yet render the existing component. */
type Route =
    | { view: 'dashboard' }
    | { view: 'desk' }
    | { view: 'bench' }
    | { view: 'orders' }
    | { view: 'order'; name: string }
    | { view: 'job'; name: string; item: string }
    | { view: 'estimate'; name: string }
    | { view: 'collect'; name: string }
    | { view: 'intake' }
    | { view: 'pos' }
    | { view: 'posDesk'; tab: 'held' | 'collect' | 'returns' }
    | { view: 'customers' }
    | { view: 'customer'; name: string }
    | { view: 'reports'; report: ReportId }
    | { view: 'settings'; section: string }
    | { view: 'kit' };

const DESK_ROLES: DWRole[] = ['executive', 'data_entry'];
const ROUTE_ROLES: Partial<Record<Route['view'], DWRole[]>> = {
    dashboard: DESK_ROLES,
    desk: DESK_ROLES,
    intake: DESK_ROLES,
    estimate: DESK_ROLES,
    collect: DESK_ROLES,
    pos: DESK_ROLES,
    posDesk: DESK_ROLES,
    customers: DESK_ROLES,
    customer: DESK_ROLES,
    reports: DESK_ROLES,
    settings: ['executive'],
};

const resolveRoute = (p: string): Route | null => {
    let m: Record<string, string> | null;
    if ((m = matchPath('/orders/:name/watch/:item', p))) return { view: 'job', name: m.name, item: m.item };
    if ((m = matchPath('/orders/:name/estimate', p))) return { view: 'estimate', name: m.name };
    if ((m = matchPath('/orders/:name/collect', p))) return { view: 'collect', name: m.name };
    if ((m = matchPath('/orders/:name', p))) return { view: 'order', name: m.name };
    if (matchPath('/orders', p)) return { view: 'orders' };
    if (matchPath('/desk', p)) return { view: 'desk' };
    if (matchPath('/bench', p)) return { view: 'bench' };
    if (matchPath('/intake', p)) return { view: 'intake' };
    if (matchPath('/dashboard', p)) return { view: 'dashboard' };
    if ((m = matchPath('/pos/:tab', p)) && ['held', 'collect', 'returns'].includes(m.tab)) return { view: 'posDesk', tab: m.tab as 'held' | 'collect' | 'returns' };
    if (matchPath('/pos', p)) return { view: 'pos' };
    if ((m = matchPath('/customers/:name', p))) return { view: 'customer', name: m.name };
    if (matchPath('/customers', p)) return { view: 'customers' };
    if ((m = matchPath('/reports/:report', p))) return { view: 'reports', report: m.report as ReportId };
    if (matchPath('/reports', p)) return { view: 'reports', report: 'workshop' };
    if ((m = matchPath('/settings/:section', p))) return { view: 'settings', section: m.section };
    if (matchPath('/settings', p)) return { view: 'settings', section: 'company' };
    if (matchPath('/kit', p)) return { view: 'kit' };
    return null;
};

/** Phone header titles; desk screens carry their own heading. */
const TITLES: Partial<Record<Route['view'], string>> = {
    dashboard: 'Today',
    desk: 'Front desk',
    bench: 'My bench',
    orders: 'Orders',
    order: 'Order',
    job: 'Job',
    estimate: 'Estimate',
    collect: 'Collect',
    intake: 'New order',
    pos: 'Point of sale',
    posDesk: 'Point of sale',
    customers: 'Customers',
    customer: 'Customer',
    reports: 'Reports',
    settings: 'Settings',
};


// Main app content (shown when authenticated)
const AppContent: React.FC = () => {
    const { hasRole, roles } = useAuth();
    const { path: currentPath, query } = useLocation();
    const landing = landingFor(roles);

    const resolved = useMemo(() => resolveRoute(currentPath), [currentPath]);
    const allowed = !!resolved && (!ROUTE_ROLES[resolved.view] || hasRole(...(ROUTE_ROLES[resolved.view] as DWRole[])));
    const route: Route | null = allowed ? resolved : null;

    // `/`, unknown paths, old `/tracker` and screens the role cannot open go to the role's home.
    useEffect(() => {
        if (currentPath === '/tracker') navigate('/desk', { replace: true });
        else if (!allowed) navigate(landing, { replace: true });
    }, [allowed, currentPath, landing]);


    if (!route) return null;

    if (route.view === 'kit') {
        return (
            <React.Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: '#F6F3EE' }} />}>
                <KitGallery />
            </React.Suspense>
        );
    }

    const screen = (() => {
        switch (route.view) {
            case 'desk': return <FrontDesk />;
            case 'bench': return <Bench />;
            case 'orders': return <OrdersScreen />;
            case 'order': return <OrderScreen key={route.name} name={route.name} />;
            case 'job': return <WatchJob key={route.item} orderName={route.name} itemName={route.item} />;
            case 'estimate': return <EstimateScreen key={route.name} name={route.name} />;
            case 'collect': return <CollectScreen key={route.name} name={route.name} preselect={query.get('watch')} />;
            case 'intake': return <Intake />;
            case 'dashboard': return <DashboardScreen />;
            case 'pos': return <PosScreen />;
            case 'posDesk': return <PosBackOffice key={route.tab} tab={route.tab} />;
            case 'customers': return <CustomersScreen />;
            case 'customer': return <CustomerScreen key={route.name} name={route.name} />;
            case 'reports': return <ReportsScreen report={route.report} />;
            case 'settings': return <SettingsScreen section={route.section} />;
        }
    })();

    return (
        <AppShell title={TITLES[route.view]}>
            {screen}
        </AppShell>
    );
};

// App wrapper with auth check
const App: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="dw-root min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
                <Spinner size={32} />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginPage />;
    }

    return <AppContent />;
};

// Root component with AuthProvider
const Root: React.FC = () => (
    <AuthProvider>
        <AppConfigProvider>
            <ToastProvider>
                <App />
            </ToastProvider>
        </AppConfigProvider>
    </AuthProvider>
);

export default Root;

