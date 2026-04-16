// Authentication service for Watch Doctor app
// Based on sales_pwa frappe API pattern

export interface UserSession {
    user: string;
    full_name: string;
}

let csrfTokenCache: string | undefined;

const getCsrfToken = (): string | undefined => {
    if (csrfTokenCache) return csrfTokenCache;

    // Check localStorage
    const stored = localStorage.getItem('csrf_token') || sessionStorage.getItem('csrf_token');
    if (stored) {
        csrfTokenCache = stored;
        return csrfTokenCache;
    }

    // Check window.frappe (Frappe Desk)
    const fromDesk = (window as any).frappe?.csrf_token;
    if (fromDesk) {
        csrfTokenCache = fromDesk;
        return csrfTokenCache;
    }

    // Check injected variable
    const injected = (window as any).csrf_token;
    if (injected) {
        csrfTokenCache = injected;
        return csrfTokenCache;
    }

    // Check meta tag
    const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
    if (meta?.content) {
        csrfTokenCache = meta.content;
        return csrfTokenCache;
    }

    // Check cookie
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match) {
        csrfTokenCache = decodeURIComponent(match[1]);
        return csrfTokenCache;
    }

    return undefined;
};

const defaultHeaders = (): Record<string, string> => {
    const csrf = getCsrfToken();
    return csrf ? { 'X-Frappe-CSRF-Token': csrf } : {};
};

const extractFrappeErrorMessage = (payload: unknown, fallback: string): string => {
    if (!payload || typeof payload !== 'object') {
        return fallback;
    }

    const data = payload as {
        _server_messages?: string;
        message?: string;
        exception?: string;
    };

    if (data._server_messages) {
        try {
            const messages = JSON.parse(data._server_messages);
            if (Array.isArray(messages) && messages.length > 0) {
                const first = typeof messages[0] === 'string' ? JSON.parse(messages[0]) : messages[0];
                if (first?.message) {
                    return first.message;
                }
            }
        } catch {
            return data._server_messages;
        }
    }

    if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
    }

    if (typeof data.exception === 'string' && data.exception.trim()) {
        const parts = data.exception.split(':');
        return parts.length > 1 ? parts.slice(1).join(':').trim() : data.exception;
    }

    return fallback;
};

const handleResponse = async (res: Response): Promise<any> => {
    if (!res.ok) {
        const text = await res.text();
        const fallback = text || res.statusText;
        let data: unknown = null;

        try {
            data = JSON.parse(text);
        } catch (_e) {
            data = null;
        }

        if (data) {
            throw new Error(extractFrappeErrorMessage(data, fallback));
        }

        const plain = text.replace(/<[^>]*>?/gm, '').trim();
        const snippet = plain ? plain.slice(0, 240) : res.statusText;
        throw new Error(snippet || res.statusText);
    }
    return res.json();
};

export const login = async (username: string, password: string): Promise<UserSession> => {
    const res = await fetch('/api/method/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders() },
        credentials: 'include',
        body: JSON.stringify({ usr: username, pwd: password }),
    });

    const data = await handleResponse(res);

    // Store CSRF token from response
    if (data?.csrf_token) {
        csrfTokenCache = data.csrf_token;
        localStorage.setItem('csrf_token', data.csrf_token);
    }

    // Get session details
    return getSession();
};

export const logout = async (): Promise<void> => {
    try {
        const res = await fetch('/api/method/logout', {
            method: 'POST',
            headers: { ...defaultHeaders() },
            credentials: 'include',
        });

        if (!res.ok) {
            const text = await res.text();
            const err = text || res.statusText || 'Logout failed';
            throw new Error(err);
        }
    } finally {
        // Always clear local state
        csrfTokenCache = undefined;
        localStorage.removeItem('csrf_token');
        sessionStorage.removeItem('csrf_token');
    }
};

export const getSession = async (): Promise<UserSession> => {
    const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        credentials: 'include',
        headers: defaultHeaders(),
    });

    const data = await handleResponse(res);
    const user = data.message as string;

    if (!user || user === 'Guest') {
        throw new Error('No active session');
    }

    // Get user details
    try {
        const fullRes = await fetch(
            `/api/resource/User/${encodeURIComponent(user)}?fields=${encodeURIComponent('["full_name"]')}`,
            {
                credentials: 'include',
                headers: defaultHeaders(),
            }
        );
        const details = await handleResponse(fullRes);
        return {
            user,
            full_name: details.data?.full_name || details.message?.full_name || user,
        };
    } catch (_e) {
        // Return basic session if can't get full name
        return { user, full_name: user };
    }
};
