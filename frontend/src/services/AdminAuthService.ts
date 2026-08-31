import axios from 'axios';

const API_BASE = '/api/admin/auth';

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  created_at?: string | null;
}

export interface CreateAdminPayload {
  username: string;
  password: string;
  email?: string;
}

export interface UpdateAdminPayload {
  username?: string;
  password?: string;
  email?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  admin: AdminUser;
}

export const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const checkSetupRequired = async (): Promise<boolean> => {
  try {
    const res = await axios.get(`${API_BASE}/setup-required`);
    return Boolean(res.data?.setup_required);
  } catch (e) {
    console.error('Error checking setup required:', e);
    return false;
  }
};

export const setupInitialAdmin = async (
  username: string,
  password: string,
  email?: string,
): Promise<LoginResponse> => {
  const res = await axios.post(`${API_BASE}/setup`, {
    username,
    password,
    email: email || null,
  });
  if (res.data.access_token) {
    localStorage.setItem('adminToken', res.data.access_token);
  }
  return res.data;
};

export const loginAdmin = async (
  username: string,
  password: string,
): Promise<LoginResponse> => {
  const res = await axios.post(`${API_BASE}/login`, {
    username,
    password,
  });
  if (res.data.access_token) {
    localStorage.setItem('adminToken', res.data.access_token);
  }
  return res.data;
};

export const getAdminMe = async (): Promise<AdminUser | null> => {
  try {
    const res = await axios.get(`${API_BASE}/me`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  } catch {
    localStorage.removeItem('adminToken');
    return null;
  }
};

export const logoutAdmin = () => {
  localStorage.removeItem('adminToken');
};

export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const res = await axios.get(`${API_BASE}/users`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const createAdminUser = async (payload: CreateAdminPayload): Promise<AdminUser> => {
  const res = await axios.post(`${API_BASE}/users`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const updateAdminUser = async (
  id: number,
  payload: UpdateAdminPayload,
): Promise<AdminUser> => {
  const res = await axios.put(`${API_BASE}/users/${id}`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const deleteAdminUser = async (id: number): Promise<{ message: string }> => {
  const res = await axios.delete(`${API_BASE}/users/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

