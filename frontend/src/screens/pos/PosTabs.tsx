import React, { useEffect, useState } from 'react';
import { Link, useLocation } from '../../router';
import { Icon, cx, useToast } from '../../design/kit';
import { tillHeld, tillLastReceipt } from '../../services/tillApi';

const TABS = [
    { to: '/pos', label: 'New sale' },
    { to: '/pos/held', label: 'Held' },
    { to: '/pos/collect', label: 'Collect payment' },
    { to: '/pos/returns', label: 'Returns' },
];

/** The till's own navigation (D9/D10): new sale, back office, reprint. */
export const PosTabs: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
    const { path } = useLocation();
    const toast = useToast();
    const [held, setHeld] = useState(0);
    useEffect(() => { tillHeld().then(r => setHeld(r.length)).catch(() => undefined); }, [refreshKey, path]);

    const reprint = async () => {
        try {
            const last = await tillLastReceipt();
            if (!last?.print_url) { toast.show('No sale to reprint yet today.'); return; }
            window.open(`${last.print_url}&trigger_print=1`, '_blank');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not find the last receipt.');
        }
    };

    return (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-dw-border -mx-4 px-4 sm:mx-0 sm:px-0">
            {TABS.map(t => {
                const on = path === t.to;
                return (
                    <Link key={t.to} to={t.to} replace aria-current={on ? 'page' : undefined}
                        className={cx('shrink-0 flex items-center gap-2 h-11 px-3.5 border-b-2 text-[14px] font-bold no-underline', on ? 'border-dw-text text-dw-text' : 'border-transparent text-dw-caption hover:text-dw-text')}>
                        {t.label}
                        {t.to === '/pos/held' && held > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-dw-warning-soft text-dw-warning text-[11px] font-extrabold flex items-center justify-center">{held}</span>}
                    </Link>
                );
            })}
            <button type="button" onClick={() => void reprint()} className="ml-auto shrink-0 flex items-center gap-2 h-11 px-3 text-[13px] font-bold text-dw-accent hover:underline">
                <Icon name="print" size={16} />Reprint last
            </button>
        </div>
    );
};
