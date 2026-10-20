/**
 * Navigation and role landing (spec B1.2, B3).
 * Owner = DW Executive, receptionist = DW Data Entry, technician = DW Technician.
 */
import type { DWRole } from '../types';
import type { IconName } from './kit/Icon';

export type Persona = 'owner' | 'desk' | 'technician';

export const personaOf = (roles: DWRole[]): Persona => {
    if (roles.includes('executive')) return 'owner';
    if (roles.includes('data_entry')) return 'desk';
    if (roles.includes('technician')) return 'technician';
    return 'desk';
};

/** Where each role starts after sign in or when opening `/`. */
export const landingFor = (roles: DWRole[]): string => {
    if (roles.includes('executive')) return '/dashboard';
    if (roles.includes('data_entry')) return '/desk';
    if (roles.includes('technician')) return '/bench';
    // Roles unknown (older backend without get_user_info): the list works for everyone.
    return '/orders';
};

export interface NavItem {
    id: string;
    label: string;
    icon: IconName;
    to: string;
    roles: DWRole[];
    group: 'main' | 'tools';
    /** False until the screen ships; shown greyed with "Soon". */
    live: boolean;
}

const DESK: DWRole[] = ['executive', 'data_entry'];

export const NAV_ITEMS: NavItem[] = [
    { id: 'desk', label: 'Front desk', icon: 'desk', to: '/desk', roles: DESK, group: 'main', live: true },
    { id: 'bench', label: 'My bench', icon: 'wrench', to: '/bench', roles: ['technician'], group: 'main', live: true },
    { id: 'orders', label: 'Orders', icon: 'list', to: '/orders', roles: ['executive', 'data_entry', 'technician'], group: 'main', live: true },
    { id: 'intake', label: 'New order', icon: 'plusCircle', to: '/intake', roles: DESK, group: 'main', live: true },
    { id: 'customers', label: 'Customers', icon: 'users', to: '/customers', roles: DESK, group: 'main', live: true },
    { id: 'pos', label: 'Point of sale', icon: 'pos', to: '/pos', roles: DESK, group: 'main', live: true },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', to: '/dashboard', roles: DESK, group: 'tools', live: true },
    { id: 'reports', label: 'Reports', icon: 'chart', to: '/reports', roles: DESK, group: 'tools', live: true },
    { id: 'settings', label: 'Settings', icon: 'settings', to: '/settings', roles: ['executive'], group: 'tools', live: true },
];

export interface TabItem {
    id: string;
    label: string;
    icon: IconName;
    /** Route, or 'more' to open the account sheet. */
    to: string | 'more';
}

/** Phone bottom tabs per persona (canvas M2, M4, M7, M8). */
export const PHONE_TABS: Record<Persona, TabItem[]> = {
    desk: [
        { id: 'desk', label: 'Desk', icon: 'desk', to: '/desk' },
        { id: 'intake', label: 'New', icon: 'plusCircle', to: '/intake' },
        { id: 'dashboard', label: 'Today', icon: 'home', to: '/dashboard' },
        { id: 'more', label: 'More', icon: 'menu', to: 'more' },
    ],
    owner: [
        { id: 'dashboard', label: 'Today', icon: 'home', to: '/dashboard' },
        { id: 'desk', label: 'Orders', icon: 'search', to: '/desk' },
        { id: 'intake', label: 'New', icon: 'plusCircle', to: '/intake' },
        { id: 'reports', label: 'Reports', icon: 'chart', to: '/reports' },
    ],
    technician: [
        { id: 'bench', label: 'My bench', icon: 'wrench', to: '/bench' },
        { id: 'orders', label: 'Find', icon: 'search', to: '/orders' },
        { id: 'more', label: 'Me', icon: 'user', to: 'more' },
    ],
};

/** Which nav item a path belongs to, for the active state. */
export const navIdForPath = (path: string): string | null => {
    if (path.startsWith('/orders')) return 'orders';
    const hit = NAV_ITEMS.find(i => path === i.to || path.startsWith(`${i.to}/`));
    return hit?.id ?? null;
};
