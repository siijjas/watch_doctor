import React from 'react';

interface HeaderProps {
    title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
    return (
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-40 ml-64">
            {/* Title/Breadcrumb */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-xl mx-8">
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Type here to search..."
                        className="w-full pl-12 pr-4 py-3 rounded-2xl bg-gray-50 border-none text-gray-600 focus:ring-2 focus:ring-purple-200 focus:bg-white transition-all"
                    />
                </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-6">
                {/* Language */}
                <button className="text-gray-400 hover:text-gray-600">🇬🇧</button>

                {/* Notifications */}
                <button className="relative text-gray-400 hover:text-purple-600">
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </button>

                {/* Profile */}
                <div className="flex items-center space-x-3 cursor-pointer">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                        WD
                    </div>
                    <div className="hidden md:block">
                        <p className="text-sm font-bold text-gray-800">Admin</p>
                        <p className="text-xs text-gray-500">Manager</p>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
