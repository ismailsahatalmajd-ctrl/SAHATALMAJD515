
import { User, Permissions, UserRole } from "./types"

/**
 * Default permissions for each role.
 * This acts as a template when creating new users.
 */
export const DEFAULT_PERMISSIONS: Record<UserRole, Partial<Permissions>> = {
    owner: {
        // Owner has everything by default, handled in hasPermission logic
    },
    manager: {
        'inventory.view': true,
        'inventory.add': true,
        'inventory.edit': true,
        'inventory.delete': true,
        'inventory.adjust': true,
        'transactions.purchase': true,
        'transactions.issue': true,
        'transactions.return': true,
        'transactions.approve': true,
        'branches.view': true,
        'branches.manage': true,
        'branch_requests.view': true,
        'branch_requests.approve': true,
        'users.view': true,
        'users.manage': true,
        'system.settings': true,
        'system.backup': true,
        'system.logs': true,
        // Pages
        'page.dashboard': true,
        'page.inventory': true,
        'page.transactions': true,
        'page.reports': true,
        'page.settings': true,
        'page.users': true,
        'page.branches': true,
    },
    supervisor: {
        'inventory.view': true,
        'inventory.add': true,
        'inventory.edit': true,
        'inventory.delete': false,
        'inventory.adjust': true,
        'transactions.purchase': true,
        'transactions.issue': true,
        'transactions.return': true,
        'transactions.approve': true,
        'branches.view': true,
        'branches.manage': false,
        'branch_requests.view': true,
        'branch_requests.approve': true,
        'users.view': false,
        'users.manage': false,
        'system.settings': false,
        'system.backup': false,
        'system.logs': false,
        // Pages
        'page.dashboard': true,
        'page.inventory': true,
        'page.transactions': true,
        'page.reports': true,
        'page.settings': false,
        'page.users': false,
        'page.branches': true,
    },
    staff: {
        'inventory.view': true,
        'inventory.add': false,
        'inventory.edit': false,
        'inventory.delete': false,
        'inventory.adjust': false,
        'transactions.purchase': false,
        'transactions.issue': true,
        'transactions.return': true, // Can create but needs approval
        'transactions.approve': false,
        'branches.view': false,
        'branches.manage': false,
        'branch_requests.view': false,
        'branch_requests.approve': false,
        'users.view': false,
        'users.manage': false,
        'system.settings': false,
        'system.backup': false,
        'system.logs': false,
        // Pages
        'page.dashboard': true,
        'page.inventory': true,
        'page.transactions': true, // E.g. only Issues/Returns
        'page.reports': false,
        'page.settings': false,
        'page.users': false,
        'page.branches': false,
    },
    view_only: {
        'inventory.view': true,
        'transactions.purchase': false,
        'transactions.issue': false,
        'transactions.return': false,
        'transactions.approve': false,
        'branches.view': true,
        'branch_requests.view': true,
        'reports.view': true,
        // NO EDIT PERMISSIONS AT ALL
        'page.dashboard': true,
        'page.inventory': true,
        'page.transactions': true,
        'page.reports': true,
        'page.settings': false,
        'page.users': false,
        'page.branches': true,
    },
    custom: {}, // Completely manual
}

/**
 * Checks if a user has a specific permission.
 */
export function hasPermission(user: User | null | undefined, permission: keyof Permissions): boolean {
    if (!user) return false;
    if (user.isActive === false) return false;

    // 1. Owner always has access
    if (user.role === 'owner') return true;

    // 1.5 Special Override for Super Admin Username
    if (user.username === 'SAHATALMAJD515' || user.displayName === 'SAHATALMAJD515') return true;

    // 2. Check explicit permission in user object
    if (user.permissions && user.permissions[permission] !== undefined) {
        return user.permissions[permission];
    }

    // 3. Fallback to Role Defaults (if needed, but usually we save full permissions on user creation)
    // For safety, we prefer explicit permissions saved on the user profile.
    // But if missing, we can retrieve from default.
    const roleDefaults = DEFAULT_PERMISSIONS[user.role];
    if (roleDefaults && roleDefaults[permission] !== undefined) {
        return roleDefaults[permission]!;
    }

    return false;
}

/**
 * Checks if a user has access to a specific route/page.
 * Similar to hasPermission but geared towards routing middleware.
 */
export function canAccessPage(user: User | null, path: string): boolean {
    if (!user) return false;
    if (user.role === 'owner') return true;

    if (path.startsWith('/settings/users')) return hasPermission(user, 'page.users');
    if (path.startsWith('/settings')) return hasPermission(user, 'page.settings');
    if (path.startsWith('/products') || path.startsWith('/categories') || path === '/') return hasPermission(user, 'page.inventory');
    if (path.startsWith('/issues') || path.startsWith('/purchases') || path.startsWith('/returns')) return hasPermission(user, 'page.transactions');
    if (path.startsWith('/reports')) return hasPermission(user, 'page.reports');
    if (path.startsWith('/branches') || path.startsWith('/branch-requests')) return hasPermission(user, 'page.branches');
    if (path === '/dashboard') return hasPermission(user, 'page.dashboard');

    return true; // Public or un-protected pages
}

export const ROLE_LABELS: Record<UserRole, { ar: string, en: string }> = {
    owner: { ar: 'المالك', en: 'Owner' },
    manager: { ar: 'مدير', en: 'Manager' },
    supervisor: { ar: 'مشرف', en: 'Supervisor' },
    staff: { ar: 'موظف', en: 'Staff' },
    view_only: { ar: 'عرض فقط', en: 'View Only' },
    custom: { ar: 'مخصص', en: 'Custom' },
}
