
import { useState, useEffect } from "react";
import { GranularPermissions, DEFAULT_GRANULAR_PERMISSIONS, getGranularPermissions } from "@/lib/granular-permissions";
import { useAuth } from "@/components/auth-provider";

export function useGranularPermissions() {
  const { user } = useAuth();
  const userId = user?.uid || user?.username || "unknown";
  
  const [permissions, setPermissions] = useState<GranularPermissions>(DEFAULT_GRANULAR_PERMISSIONS);

  useEffect(() => {
    const load = async () => {
      const p = await getGranularPermissions(userId);
      setPermissions(p);
    };
    load();
  }, [userId]);

  useEffect(() => {
    const handleUpdate = async (event: any) => {
      if (event.detail?.userId === userId) {
        const p = await getGranularPermissions(userId);
        setPermissions(p);
      }
    };

    window.addEventListener('granular_permissions_updated' as any, handleUpdate);
    return () => window.removeEventListener('granular_permissions_updated' as any, handleUpdate);
  }, [userId]);

  const isPowerUser = user?.role === 'owner' || user?.role === 'admin';
  
  return {
    permissions,
    isRestricted: !isPowerUser,
    // Helper to check if an element should be shown
    shouldShow: (path: string) => {
      if (isPowerUser) return true;
      
      const parts = path.split('.');
      let current: any = permissions;
      for (const part of parts) {
        if (!current || current[part] === undefined) return true;
        current = current[part];
      }
      return current === true;
    }
  };
}
