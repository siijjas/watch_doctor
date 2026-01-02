import React from 'react';
import { WatchIcon } from '../icons/WatchIcon';
import { DashboardIcon } from '../icons/DashboardIcon';
import { ListIcon } from '../icons/ListIcon';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
    currentView: string;
    onChangeView: (view: any) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
    const { user, logout } = useAuth();

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" /> },
        { id: 'orders', label: 'Orders', icon: <ListIcon className="w-5 h-5" /> },
        {
            id: 'pos', label: 'POS', icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            )
        },
    ];

    return (
        <div className="w-64 bg-white h-screen fixed left-0 top-0 border-r border-gray-100 flex flex-col z-50">
            {/* Logo */}
            <div className="p-6 flex items-center space-x-3">
                <div className="bg-purple-600 p-2 rounded-lg text-white">
                    <WatchIcon className="w-6 h-6" />
                </div>
                <h1 className="text-xl font-bold text-gray-800 tracking-tight">WatchDoc</h1>
            </div>

            {/* Menu */}
            <nav className="flex-1 px-4 py-4 space-y-1">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onChangeView(item.id)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${currentView === item.id
                            ? 'bg-purple-50 text-purple-600 font-semibold'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                    >
                        <span className={currentView === item.id ? 'text-purple-600' : 'text-gray-400'}>
                            {item.icon}
                        </span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            {/* User Info & Logout */}
            <div className="p-6 border-t border-gray-100">
                {user && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
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
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                )}
                <p className="text-xs text-gray-400 text-center mt-4">v1.2.0 © 2025</p>
            </div>
        </div>
    );
};

export default Sidebar;
