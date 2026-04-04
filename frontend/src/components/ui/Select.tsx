
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, id, className, children, ...props }) => {
    const selectId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined);
    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <select
                id={selectId}
                className={`w-full px-3 py-2.5 border border-[#E8E8E8] rounded-xl bg-white text-sm shadow-sm focus:ring-[#648DDA] focus:border-[#648DDA] ${className || ''}`}
                {...props}
            >
                {children}
            </select>
        </div>
    );
};
