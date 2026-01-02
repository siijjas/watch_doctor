import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';

interface DropdownMenuItem {
    label: string;
    icon?: string;
    onClick: () => void;
    variant?: 'default' | 'destructive' | 'success';
    disabled?: boolean;
    hidden?: boolean;
}

interface ActionsDropdownProps {
    items: DropdownMenuItem[];
    label?: string;
}

export const ActionsDropdown: React.FC<ActionsDropdownProps> = ({ items, label = 'Actions' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter out hidden items
    const visibleItems = items.filter(item => !item.hidden);

    if (visibleItems.length === 0) {
        return null;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="outline"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2"
            >
                <span>⚡</span>
                {label}
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </Button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <div className="py-1">
                        {visibleItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    if (!item.disabled) {
                                        item.onClick();
                                        setIsOpen(false);
                                    }
                                }}
                                disabled={item.disabled}
                                className={`
                  w-full px-4 py-2.5 text-left text-sm flex items-center gap-3
                  transition-colors duration-150
                  ${item.disabled
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : item.variant === 'destructive'
                                            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                                            : item.variant === 'success'
                                                ? 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                                                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                    }
                `}
                            >
                                {item.icon && <span className="text-base">{item.icon}</span>}
                                <span className="font-medium">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
