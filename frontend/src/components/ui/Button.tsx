
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({ children, className, variant = 'primary', size = 'md', ...props }) => {
  const baseClasses = "inline-flex items-center justify-center rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors disabled:opacity-50 disabled:pointer-events-none";

  const variantClasses = {
    primary: "bg-[#648DDA] text-[#FDFEFF] hover:opacity-90 focus:ring-[#AFC3E8]",
    secondary: "bg-[#F0EDEA] text-[#4B5563] hover:bg-[#E9E4DF] focus:ring-[#D7CEC4]",
    ghost: "hover:bg-[#F5F1EC] text-[#4B5563]",
    destructive: "bg-[#DC2626] text-white hover:bg-[#B91C1C] focus:ring-[#FCA5A5]",
    outline: "border border-[#E8E8E8] bg-white text-[#4B5563] hover:bg-[#F9F7F4] focus:ring-[#DADADA]",
  };

  const sizeClasses = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-base",
    lg: "h-12 px-6 text-lg",
    icon: "h-9 w-9"
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className || ''}`;

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};
