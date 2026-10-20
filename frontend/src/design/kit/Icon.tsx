import React from 'react';

/** Stroke icon set used across v2 screens (24px grid, 1.8 stroke). */
const PATHS = {
    home: <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" />,
    desk: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M12 16v4" /></>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    plusCircle: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14a5 5 0 0 1 6 5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    pos: <><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /><path d="M2 3h3l2.5 11h11L21 7H6" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    chart: <path d="M4 20v-8M10 20V4M16 20v-6M22 20H2" />,
    trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
    settings: <><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h12" /><circle cx="14" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></>,
    wrench: <><path d="M14 7a4 4 0 0 1 5 5l-8 8-4-4z" /><path d="m3 21 3-3" /></>,
    watch: <><circle cx="12" cy="12" r="6" /><path d="M12 9v3l2 1.5M9 3h6l1 3M9 21h6l1-3M8 6 9 3M8 18l1 3" /></>,
    whatsapp: <path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z" />,
    print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 5 5 9-10" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    logout: <path d="M10 17l5-5-5-5M15 12H3M12 3h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7" />,
    more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
    phone: <path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10" /></>,
    box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    filter: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
    download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

interface IconProps {
    name: IconName;
    size?: number;
    className?: string;
    strokeWidth?: number;
    /** Give a label only when the icon stands alone without visible text. */
    label?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className, strokeWidth = 1.8, label }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={label ? undefined : true}
        role={label ? 'img' : undefined}
        aria-label={label}
        focusable="false"
    >
        {PATHS[name]}
    </svg>
);
