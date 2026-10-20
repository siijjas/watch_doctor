import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { Link, useLocation } from '../../router';
import { NAV_ITEMS, PHONE_TABS, navIdForPath, personaOf, type NavItem } from '../nav';
import { Sheet } from './Sheet';
import { Toggle } from './Choice';
import { useInstall, useInstallBanner, useLargeText } from '../pwa';
import { Icon } from './Icon';
import { cx } from './primitives';

const PERSONA_LABEL = { owner: 'Owner', desk: 'Front desk', technician: 'Technician' } as const;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'U';

const NavLink: React.FC<{ item: NavItem; active: boolean; onNavigate?: () => void }> = ({ item, active, onNavigate }) => {
    const body = (
        <>
            <Icon name={item.icon} size={20} className={active ? 'text-dw-accent' : 'text-dw-caption'} />
            <span className="flex-1">{item.label}</span>
            {!item.live && <span className="text-[11px] font-bold text-dw-caption">Soon</span>}
        </>
    );
    const cls = cx(
        'flex items-center gap-3 h-[42px] px-3 rounded-dw-control text-[14px] font-bold no-underline',
        active ? 'bg-dw-ground text-dw-text' : 'text-dw-body hover:bg-dw-ground hover:text-dw-text',
        !item.live && 'opacity-60 pointer-events-none',
    );
    if (!item.live) return <span className={cls} aria-disabled="true">{body}</span>;
    return <Link to={item.to} className={cls} aria-current={active ? 'page' : undefined} onClick={onNavigate}>{body}</Link>;
};

interface AppShellProps {
    children: React.ReactNode;
    /** Phone header title; desk screens put their own heading in the page. */
    title?: string;
    /** Right side of the phone header, e.g. a scan button. */
    actions?: React.ReactNode;
    /** Full-bleed content without padding (POS). */
    bleed?: boolean;
}

/**
 * v2 frame: sidebar on desk (≥ 1024 px), header + bottom tabs below that.
 * Items are filtered by role exactly as the old sidebar did (`hasRole`).
 */
export const AppShell: React.FC<AppShellProps> = ({ children, title, actions, bleed }) => {
    const { user, roles, hasRole, logout } = useAuth();
    const { config } = useAppConfig();
    const { path } = useLocation();
    const [moreOpen, setMoreOpen] = useState(false);
    const [large, setLarge] = useLargeText();
    const install = useInstall();
    const banner = useInstallBanner();

    const persona = personaOf(roles);
    const activeId = navIdForPath(path);
    const visible = NAV_ITEMS.filter(i => hasRole(...i.roles) || (roles.length === 0 && i.id === 'orders'));
    const main = visible.filter(i => i.group === 'main');
    const tools = visible.filter(i => i.group === 'tools');
    const tabs = PHONE_TABS[persona];
    const tabIds = new Set(tabs.map(t => t.id));
    const name = user?.full_name || user?.user || '';

    const brand = config.logoUrl
        ? <img src={config.logoUrl} alt="Company logo" className="max-h-9 max-w-[150px] object-contain" />
        : (
            <span className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-dw-text text-white flex items-center justify-center"><Icon name="watch" size={16} /></span>
                <span className="text-[17px] font-extrabold tracking-[-.01em]">Watch Doctor</span>
            </span>
        );

    return (
        <div className="dw-root min-h-screen lg:flex">
            {/* Desk sidebar */}
            <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col bg-dw-surface border-r border-dw-border z-40">
                <div className="px-5 h-16 flex items-center">{brand}</div>
                <nav className="px-3 flex flex-col gap-0.5" aria-label="Main">
                    {main.map(i => <NavLink key={i.id} item={i} active={activeId === i.id} />)}
                </nav>
                {tools.length > 0 && (
                    <nav className="mx-3 mt-6 pt-4 flex flex-col gap-0.5 border-t border-dw-line" aria-label="Owner tools">
                        {tools.map(i => <NavLink key={i.id} item={i} active={activeId === i.id} />)}
                    </nav>
                )}
                <div className="mt-auto p-4 border-t border-dw-line flex items-center gap-3">
                    <span className="w-9 h-9 rounded-[12px] bg-dw-sunken text-dw-text font-extrabold text-[13px] flex items-center justify-center">{initials(name)}</span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-extrabold truncate">{name}</span>
                        <span className="block text-[12px] font-semibold text-dw-caption">{PERSONA_LABEL[persona]}</span>
                    </span>
                    <button type="button" onClick={() => void logout()} className="w-9 h-9 rounded-lg text-dw-caption hover:bg-dw-danger-soft hover:text-dw-danger flex items-center justify-center" aria-label="Sign out" title="Sign out">
                        <Icon name="logout" size={18} />
                    </button>
                </div>
            </aside>

            <div className="flex-1 min-w-0 lg:ml-[232px] flex flex-col min-h-screen">
                {/* Phone / tablet header */}
                <header className="lg:hidden sticky top-0 z-30 bg-[rgba(246,243,238,.95)] backdrop-blur px-4 h-14 flex items-center gap-3">
                    <h1 className="m-0 flex-1 min-w-0 truncate text-[20px] font-extrabold tracking-[-.01em]">{title ?? brand}</h1>
                    {actions}
                    <button type="button" onClick={() => setMoreOpen(true)} className="w-10 h-10 rounded-[12px] bg-dw-text text-white text-[13px] font-extrabold" aria-label="Account and more">
                        {initials(name)}
                    </button>
                </header>

                <main className={cx('flex-1 min-w-0', !bleed && 'px-4 pb-24 pt-2 sm:px-6 lg:px-8 lg:py-6 lg:pb-8', large && 'dw-large')}>
                    {banner.show && (
                        <div className="lg:hidden mb-3 flex items-center gap-3 p-3 rounded-dw-control bg-[#EEF3FC] text-[#1F4B9B]">
                            <Icon name="download" size={20} />
                            <span className="flex-1 text-[13px] font-bold">{install.canPrompt ? 'Add Watch Doctor to your home screen' : 'Add to the home screen: tap Share, then “Add to Home Screen”'}</span>
                            {install.canPrompt && <button type="button" onClick={() => void install.install()} className="h-9 px-3 rounded-[10px] bg-dw-accent text-white text-[13px] font-bold">Install</button>}
                            <button type="button" onClick={banner.dismiss} className="h-9 px-2 text-[13px] font-bold">Not now</button>
                        </div>
                    )}
                    {children}
                </main>

                {/* Phone / tablet tabs */}
                <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex bg-dw-surface border-t border-dw-border pb-[env(safe-area-inset-bottom)]" aria-label="Main">
                    {tabs.map(t => {
                        const active = t.to !== 'more' && activeId === t.id;
                        const cls = cx('flex-1 flex flex-col items-center gap-1 pt-2.5 pb-3 text-[11px] font-bold no-underline', active ? 'text-dw-accent' : 'text-dw-caption hover:text-dw-accent');
                        return t.to === 'more'
                            ? <button key={t.id} type="button" className={cls} onClick={() => setMoreOpen(true)}><Icon name={t.icon} size={22} />{t.label}</button>
                            : <Link key={t.id} to={t.to} className={cls} aria-current={active ? 'page' : undefined}><Icon name={t.icon} size={22} />{t.label}</Link>;
                    })}
                </nav>
            </div>

            <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={name || 'Account'} description={PERSONA_LABEL[persona]}>
                <nav className="flex flex-col gap-0.5" aria-label="More">
                    {visible.filter(i => !tabIds.has(i.id)).map(i => (
                        <NavLink key={i.id} item={i} active={activeId === i.id} onNavigate={() => setMoreOpen(false)} />
                    ))}
                    <div className="mt-3 pt-3 border-t border-dw-line flex flex-col gap-3 px-1">
                        <Toggle checked={large} onChange={setLarge} label="Larger text" description="On this device only" />
                        {install.canPrompt && <button type="button" onClick={() => void install.install()} className="flex items-center gap-3 h-[42px] px-2 rounded-dw-control text-[14px] font-bold text-dw-accent hover:bg-dw-ground"><Icon name="download" size={20} />Install the app</button>}
                        {!install.canPrompt && install.iosHint && <p className="m-0 text-[12px] font-semibold text-dw-caption">To install: tap Share, then “Add to Home Screen”.</p>}
                    </div>
                    <button type="button" onClick={() => void logout()} className="flex items-center gap-3 h-[42px] px-3 rounded-dw-control text-[14px] font-bold text-dw-danger hover:bg-dw-danger-soft mt-2">
                        <Icon name="logout" size={20} /> Sign out
                    </button>
                </nav>
            </Sheet>
        </div>
    );
};
