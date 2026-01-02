
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, id, className, children, ...props }) => {
    const selectId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined);
    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}
            <select
                id={selectId}
                className={`w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 ${className || ''}`}
                {...props}
            >
                {children}
            </select>
        </div>
    );
};
