import React from 'react';
import { cx, EmptyState, Spinner } from './primitives';

export interface Column<T> {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    align?: 'left' | 'right' | 'center';
    /** Tailwind width class, e.g. 'w-32'. */
    width?: string;
    /** Numbers use tabular figures and right alignment by default. */
    numeric?: boolean;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    onRowClick?: (row: T) => void;
    loading?: boolean;
    empty?: { title: string; body?: string; action?: React.ReactNode };
    footer?: React.ReactNode;
    caption?: string;
    dense?: boolean;
}

/** The single table style. Scrolls sideways inside its card on phones. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, empty, footer, caption, dense }: DataTableProps<T>) {
    return (
        <div className="bg-dw-surface border border-dw-border rounded-dw-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[14px]">
                    {caption && <caption className="sr-only">{caption}</caption>}
                    <thead>
                        <tr className="bg-dw-ground">
                            {columns.map(c => (
                                <th
                                    key={c.key}
                                    scope="col"
                                    className={cx(
                                        'px-4 h-10 text-[12px] font-extrabold uppercase tracking-[.05em] text-dw-caption whitespace-nowrap border-b border-dw-border',
                                        (c.align ?? (c.numeric ? 'right' : 'left')) === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                                        c.width,
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={columns.length} className="py-10 text-center text-dw-caption"><span className="inline-flex items-center gap-2"><Spinner /> Loading</span></td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={columns.length}><EmptyState icon="search" title={empty?.title ?? 'Nothing here yet'} body={empty?.body} action={empty?.action} /></td></tr>
                        )}
                        {!loading && rows.map(row => (
                            <tr
                                key={rowKey(row)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                                tabIndex={onRowClick ? 0 : undefined}
                                className={cx('border-b border-dw-line last:border-b-0', onRowClick && 'cursor-pointer hover:bg-dw-ground focus:bg-dw-ground focus:outline-none')}
                            >
                                {columns.map(c => (
                                    <td
                                        key={c.key}
                                        className={cx(
                                            'px-4 align-middle',
                                            dense ? 'py-2' : 'py-3',
                                            (c.align ?? (c.numeric ? 'right' : 'left')) === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                                            c.numeric && 'tabular-nums font-semibold whitespace-nowrap',
                                        )}
                                    >
                                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {footer && <tfoot className="bg-dw-ground border-t border-dw-border">{footer}</tfoot>}
                </table>
            </div>
        </div>
    );
}
