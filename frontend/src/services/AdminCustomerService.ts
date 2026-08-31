import axios from 'axios';
import { getAuthHeaders } from './AdminAuthService';

const API_BASE = '/api/admin';

export interface DashboardStats {
  total_customers: number;
  active_customers: number;
  expiring_soon_customers: number;
  expired_customers: number;
  suspended_customers: number;
  monthly_income: number;
  total_income: number;
}

export interface CustomerItem {
  id: number;
  uuid_token: string;
  name: string;
  contact: string | null;
  notes: string | null;
  status: string;
  computed_status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUSPENDED';
  start_date: string;
  expiration_date: string;
  max_devices: number;
  devices_count?: number;
  created_at: string;
  total_paid: number;
}

export interface CustomerDeviceItem {
  id: number;
  device_name: string;
  ip_address: string | null;
  user_agent: string | null;
  last_active: string;
  created_at: string;
}

export interface CreateCustomerPayload {
  name: string;
  contact?: string;
  notes?: string;
  expiration_date: string; // ISO string
  max_devices?: number;
  register_payment?: boolean;
  amount?: number;
  currency?: string;
  plan_name?: string;
  payment_method?: string;
}

export interface UpdateCustomerPayload {
  name: string;
  contact?: string;
  notes?: string;
  expiration_date: string; // ISO string
  max_devices?: number;
  status?: string;
}

export interface RenewCustomerPayload {
  new_expiration_date: string; // ISO string
  amount?: number;
  currency?: string;
  plan_name?: string;
  payment_method?: string;
  note?: string;
}

export interface PaymentItem {
  id: number;
  customer_id: number;
  customer_name: string;
  amount: number;
  currency: string;
  payment_date: string;
  plan_name: string | null;
  payment_method: string | null;
  note: string | null;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const res = await axios.get(`${API_BASE}/stats`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const getCustomersList = async (
  q: string = '',
  statusFilter: string = 'ALL',
): Promise<CustomerItem[]> => {
  const res = await axios.get(`${API_BASE}/customers`, {
    params: { q, status_filter: statusFilter },
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const createCustomer = async (
  payload: CreateCustomerPayload,
): Promise<{ success: boolean; customer_id: number; uuid_token: string }> => {
  const res = await axios.post(`${API_BASE}/customers`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const getCustomerDetail = async (id: number): Promise<any> => {
  const res = await axios.get(`${API_BASE}/customers/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const updateCustomer = async (
  id: number,
  payload: UpdateCustomerPayload,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.put(`${API_BASE}/customers/${id}`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const renewCustomer = async (
  id: number,
  payload: RenewCustomerPayload,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.post(`${API_BASE}/customers/${id}/renew`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const toggleCustomerStatus = async (
  id: number,
): Promise<{ success: boolean; new_status: string }> => {
  const res = await axios.post(`${API_BASE}/customers/${id}/toggle-status`, {}, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const deleteCustomer = async (
  id: number,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.delete(`${API_BASE}/customers/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const getRecentPayments = async (limit = 50): Promise<PaymentItem[]> => {
  const res = await axios.get(`${API_BASE}/payments`, {
    params: { limit },
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const getCustomerDevices = async (customerId: number): Promise<CustomerDeviceItem[]> => {
  const res = await axios.get(`${API_BASE}/customers/${customerId}/devices`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const deleteCustomerDevice = async (
  customerId: number,
  deviceId: number,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.delete(`${API_BASE}/customers/${customerId}/devices/${deviceId}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const resetCustomerDevices = async (
  customerId: number,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.delete(`${API_BASE}/customers/${customerId}/devices`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

