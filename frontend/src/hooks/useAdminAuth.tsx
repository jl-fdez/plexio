import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  AdminUser,
  checkSetupRequired,
  getAdminMe,
  loginAdmin,
  logoutAdmin,
  setupInitialAdmin,
} from '@/services/AdminAuthService';

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  setupRequired: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  refreshAdmin: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);

  const refreshAdmin = async () => {
    try {
      const isSetupReq = await checkSetupRequired();
      setSetupRequired(isSetupReq);

      if (!isSetupReq) {
        const currentAdmin = await getAdminMe();
        setAdmin(currentAdmin);
      } else {
        setAdmin(null);
      }
    } catch (e) {
      console.error('Error loading admin auth:', e);
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAdmin();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await loginAdmin(username, password);
    setAdmin(res.admin);
  };

  const setup = async (username: string, password: string, email?: string) => {
    const res = await setupInitialAdmin(username, password, email);
    setAdmin(res.admin);
    setSetupRequired(false);
  };

  const logout = () => {
    logoutAdmin();
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        setupRequired,
        login,
        setup,
        logout,
        refreshAdmin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
