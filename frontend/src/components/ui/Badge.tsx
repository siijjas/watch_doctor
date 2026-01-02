
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, className }) => {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  return (
    <span className={`${baseClasses} ${className || 'bg-gray-100 text-gray-800'}`}>
      {children}
    </span>
  );
};
