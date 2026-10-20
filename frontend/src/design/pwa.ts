/**
 * Phone polish (spec Phase 5): install to the home screen and large text.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Register the service worker (served at /repair_sw.js) and keep the install prompt for later. */
export const registerPwa = () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt; emit(); });
    window.addEventListener('appinstalled', () => { deferred = null; emit(); });
    const underApp = window.location.pathname === '/repair' || window.location.pathname.startsWith('/repair/');
    if (underApp && 'serviceWorker' in navigator) {
        window.addEventListener('load', () => { navigator.serviceWorker.register('/repair_sw.js', { scope: '/repair/' }).catch(() => undefined); });
    }
};

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** Whether the app can be installed here, and how. */
export const useInstall = () => {
    const prompt = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => deferred, () => null);
    const installed = typeof window !== 'undefined' && standalone();
    return {
        installed,
        canPrompt: !!prompt && !installed,
        /** iPhone Safari has no prompt; people add it from the Share menu. */
        iosHint: !installed && typeof window !== 'undefined' && ios(),
        install: async () => {
            if (!deferred) return false;
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            deferred = null;
            emit();
            return outcome === 'accepted';
        },
    };
};

const LARGE_KEY = 'dw.largeText';
const readLarge = () => { try { return window.localStorage.getItem(LARGE_KEY) === '1'; } catch { return false; } };
const largeListeners = new Set<() => void>();

/** Larger text on this device (the bench is read at arm's length). */
export const useLargeText = (): [boolean, (v: boolean) => void] => {
    const on = useSyncExternalStore(cb => { largeListeners.add(cb); return () => largeListeners.delete(cb); }, readLarge, () => false);
    const set = (v: boolean) => {
        try { window.localStorage.setItem(LARGE_KEY, v ? '1' : '0'); } catch { /* not kept */ }
        largeListeners.forEach(l => l());
    };
    return [on, set];
};

/** One-time phone banner offering to install; remembers "Not now". */
export const useInstallBanner = () => {
    const { canPrompt, iosHint, installed } = useInstall();
    const [dismissed, setDismissed] = useState(true);
    useEffect(() => { try { setDismissed(window.localStorage.getItem('dw.installDismissed') === '1'); } catch { setDismissed(false); } }, []);
    const dismiss = () => { setDismissed(true); try { window.localStorage.setItem('dw.installDismissed', '1'); } catch { /* not kept */ } };
    return { show: !installed && !dismissed && (canPrompt || iosHint), dismiss };
};
