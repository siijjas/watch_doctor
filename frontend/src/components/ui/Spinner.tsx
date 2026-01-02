
import React from 'react';

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'sm' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-4',
  };

  return (
    <div
      className={`animate-spin rounded-full border-white border-t-transparent ${sizeClasses[size]}`}
      role="status"
    >
        <span className="sr-only">Loading...</span>
    </div>
  );
};
