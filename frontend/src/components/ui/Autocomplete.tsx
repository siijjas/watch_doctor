import React, { useState, useRef, useEffect } from 'react';

interface AutocompleteOption {
    value: string;
    label: string;
    subtitle?: string;
}

interface AutocompleteProps {
    label?: string;
    placeholder?: string;
    options: AutocompleteOption[];
    value: string;
    onChange: (value: string) => void;
    onSearch?: (query: string) => void;
    onCreate?: (query: string) => void;
    className?: string;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
    label,
    placeholder = 'Search...',
    options,
    value,
    onChange,
    onSearch,
    onCreate,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [displayText, setDisplayText] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Update display text when value changes
    useEffect(() => {
        const selectedOption = options.find(opt => opt.value === value);
        const newDisplayText = selectedOption ? selectedOption.label : '';
        setDisplayText(newDisplayText);
    }, [value, options]);

    // Filter options based on search query
    // If onSearch is provided, skip client-side filtering and use server results
    const filteredOptions = onSearch
        ? options  // Server-side filtering via onSearch callback
        : searchQuery
            ? options.filter(opt =>
                opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                opt.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            : options;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset highlighted index when filtered options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchQuery]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsOpen(true);
        if (onSearch) {
            onSearch(query);
        }
    };

    const handleOptionClick = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchQuery('');
        inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setIsOpen(true);
            return;
        }

        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    handleOptionClick(filteredOptions[highlightedIndex].value);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSearchQuery('');
                break;
        }
    };

    const handleFocus = () => {
        setIsOpen(true);
        // If options are empty and onSearch is provided, trigger a search
        if (onSearch && options.length === 0 && !searchQuery) {
            onSearch('');
        }
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={isOpen ? searchQuery : displayText}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoComplete="off"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredOptions.map((option, index) => (
                        <div
                            key={option.value}
                            onClick={() => handleOptionClick(option.value)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`px-3 py-2 cursor-pointer transition-colors ${index === highlightedIndex
                                ? 'bg-blue-100 dark:bg-blue-900'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                } ${option.value === value ? 'font-semibold' : ''}`}
                        >
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                                {option.label}
                            </div>
                            {option.subtitle && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {option.subtitle}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {isOpen && filteredOptions.length === 0 && searchQuery && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-hidden">
                    {onCreate ? (
                        <div
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center"
                            onClick={() => {
                                onCreate(searchQuery);
                                setIsOpen(false);
                                setSearchQuery('');
                            }}
                        >
                            <span className="mr-2 text-lg leading-none">+</span> Create "{searchQuery}"
                        </div>
                    ) : (
                        <div className="p-3 text-sm text-gray-500 dark:text-gray-400">
                            No results found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
