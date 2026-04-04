import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
    title: string;
    onToggleSidebar?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onToggleSidebar }) => {
    const { user } = useAuth();
    const firstName = user?.full_name?.split(' ')[0] || 'there';

    return (
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8 lg:py-6 sticky top-0 z-40" style={{ backgroundColor: '#FAF7F2' }}>
            {/* Left: Hamburger + Greeting */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onToggleSidebar}
                    className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#F0EDEA] transition-colors -ml-1"
                    aria-label="Toggle menu"
                >
                    <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <div>
                    <h2 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">Hello, {firstName}</h2>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5 hidden sm:block">What are you working on?</p>
                </div>
            </div>

            {/* Right: Search Bar — hidden on small screens */}
            <div className="flex-1 max-w-md ml-4 sm:ml-8 hidden sm:block">
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Search"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                        style={{ border: '1px solid #E8E8E8' }}
                    />
                </div>
            </div>
        </header>
    );
};

export default Header;
