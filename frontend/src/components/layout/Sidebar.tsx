import React from 'react';
import { WatchIcon } from '../icons/WatchIcon';
import { DashboardIcon } from '../icons/DashboardIcon';
import { ListIcon } from '../icons/ListIcon';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';

interface SidebarProps {
    currentView: string;
    onChangeView: (view: any) => void;
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isMobileOpen = false, onMobileClose }) => {
    const { user, logout } = useAuth();
    const { config } = useAppConfig();

    const mainItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" /> },
        { id: 'orders', label: 'Orders', icon: <ListIcon className="w-5 h-5" /> },
        {
            id: 'pos', label: 'POS', icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            )
        },
    ];

    const toolItems = [
        {
            id: 'daily-report', label: 'Reports', icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            )
        },
        {
            id: 'settings', label: 'Settings', icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        },
    ];

    const handleNav = (id: string) => {
        onChangeView(id);
        onMobileClose?.();
    };

    const NavButton: React.FC<{ id: string; label: string; icon: React.ReactNode }> = ({ id, label, icon }) => (
        <button
            onClick={() => handleNav(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                currentView === id
                    ? 'text-gray-900 font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
            }`}
            style={currentView === id ? { backgroundColor: '#F0EDEA' } : undefined}
        >
            <span className={currentView === id ? 'text-gray-900' : 'text-gray-400'}>
                {icon}
            </span>
            <span>{label}</span>
        </button>
    );

    return (
        <>
            {/* Mobile overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                    onClick={onMobileClose}
                />
            )}

            <div
                className={`
                    w-[240px] bg-white h-screen fixed left-0 top-0 flex flex-col z-50
                    transition-transform duration-300 ease-in-out
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
                    lg:translate-x-0
                `}
                style={{ borderRight: '1px solid #EDEDED' }}
            >
            {/* Logo */}
            <div className="px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    {config.logoUrl ? (
                        <img
                            src={config.logoUrl}
                            alt="Company logo"
                            className="max-h-10 max-w-[140px] object-contain"
                        />
                    ) : (
                        <>
                            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white flex-shrink-0">
                                <WatchIcon className="w-4 h-4" />
                            </div>
                            <span className="text-lg font-bold text-gray-900 tracking-tight">WatchDoc</span>
                        </>
                    )}
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="px-3 mt-1 space-y-0.5">
                {mainItems.map((item) => (
                    <NavButton key={item.id} {...item} />
                ))}
            </nav>

            {/* Tools Section */}
            <div className="px-3 mt-8">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tools</p>
                <nav className="space-y-0.5">
                    {toolItems.map((item) => (
                        <NavButton key={item.id} {...item} />
                    ))}
                </nav>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User Info & Logout */}
            <div className="p-5" style={{ borderTop: '1px solid #EDEDED' }}>
                {user && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ backgroundColor: '#F0EDEA', color: '#6B5E54' }}>
                                {user.full_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-800 truncate max-w-[100px]">
                                    {user.full_name || user.user}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Logout"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                )}
                <p className="text-xs text-gray-400 text-center mt-3">v1.2.0 © 2025</p>
            </div>
        </div>
        </>
    );
};

export default Sidebar;
