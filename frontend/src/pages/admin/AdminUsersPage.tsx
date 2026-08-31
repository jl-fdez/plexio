import { FC, useEffect, useState } from 'react';
import {
  Edit3,
  Key,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useToast } from '@/hooks/useToast';
import {
  AdminUser,
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser,
} from '@/services/AdminAuthService';

export const AdminUsersPage: FC = () => {
  const { toast } = useToast();
  const { admin: currentAdmin } = useAdminAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Formulario Creación
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Formulario Edición / Cambio de contraseña
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editing, setEditing] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (e) {
      console.error('Error fetching admin users:', e);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la lista de administradores.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      toast({
        title: 'Campos requeridos',
        description: 'El usuario y la contraseña son obligatorios.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      await createAdminUser({
        username: newUsername.trim(),
        email: newEmail.trim() || undefined,
        password: newPassword,
      });

      toast({
        title: '¡Administrador Creado!',
        description: `El usuario ${newUsername} fue registrado exitosamente.`,
        variant: 'success',
      });

      setIsCreateModalOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      void loadUsers();
    } catch (err: any) {
      toast({
        title: 'Error al crear',
        description: err.response?.data?.detail || 'No se pudo registrar el administrador.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: AdminUser) => {
    setSelectedUser(u);
    setEditUsername(u.username);
    setEditEmail(u.email || '');
    setEditPassword('');
    setIsEditModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setEditing(true);
    try {
      await updateAdminUser(selectedUser.id, {
        username: editUsername.trim() || undefined,
        email: editEmail.trim() || undefined,
        password: editPassword.trim() ? editPassword.trim() : undefined,
      });

      toast({
        title: '¡Administrador Actualizado!',
        description: editPassword.trim()
          ? 'Datos y contraseña actualizados con éxito.'
          : 'Datos de perfil actualizados.',
        variant: 'success',
      });

      setIsEditModalOpen(false);
      setSelectedUser(null);
      void loadUsers();
    } catch (err: any) {
      toast({
        title: 'Error al actualizar',
        description: err.response?.data?.detail || 'No se pudo actualizar.',
        variant: 'destructive',
      });
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!window.confirm(`¿Estás seguro de que deseas revocar el acceso y eliminar a "${u.username}"?`)) {
      return;
    }

    try {
      await deleteAdminUser(u.id);
      toast({
        title: 'Administrador Eliminado',
        description: `Se eliminó la cuenta de ${u.username}.`,
        variant: 'success',
      });
      void loadUsers();
    } catch (err: any) {
      toast({
        title: 'No se pudo eliminar',
        description: err.response?.data?.detail || 'Error al eliminar administrador.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ShieldCheck className="w-8 h-8 text-indigo-400" />
            Administradores del Portal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestiona los usuarios con acceso total a PX Central, cambia contraseñas y asigna nuevos administradores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => void loadUsers()}
            variant="outline"
            size="sm"
            className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nuevo Administrador
          </Button>
        </div>
      </div>

      {/* Tarjeta de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{users.length}</div>
            <div className="text-xs text-slate-400">Administradores Activos</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-semibold text-white truncate">
              {currentAdmin?.username || 'admin'}
            </div>
            <div className="text-xs text-emerald-400 font-medium">Sesión Actual Conectada</div>
          </div>
        </div>
      </div>

      {/* Lista de Administradores */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        <div className="p-4 border-b border-slate-800/80">
          <h2 className="text-sm font-semibold text-white">Cuentas con Permiso Administrativo</h2>
        </div>

        <div className="divide-y divide-slate-800/60">
          {loading ? (
            <div className="p-8 text-center text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-2" />
              Cargando administradores...
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No se encontraron usuarios administradores.
            </div>
          ) : (
            users.map((u) => {
              const isMe = currentAdmin?.id === u.id || currentAdmin?.username === u.username;
              return (
                <div
                  key={u.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                      {u.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-base">{u.username}</span>
                        {isMe && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                            TÚ (Sesión Actual)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          {u.email || 'Sin correo asociado'}
                        </span>
                        {u.created_at && (
                          <span className="text-slate-500">
                            • Creado: {new Date(u.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => openEdit(u)}
                      variant="outline"
                      size="sm"
                      className="border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-200 rounded-xl text-xs gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar / Contraseña
                    </Button>

                    {!isMe && (
                      <Button
                        onClick={() => void handleDelete(u)}
                        variant="outline"
                        size="sm"
                        className="border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-xs gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL CREAR ADMINISTRADOR */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                Registrar Nuevo Administrador
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nombre de Usuario *
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ej: admin2, soporte"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Correo Electrónico (Opcional)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="admin@tudominio.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Contraseña Inicial *
                </label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
                >
                  {creating ? 'Creando...' : 'Guardar Administrador'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR ADMINISTRADOR / CAMBIAR CONTRASEÑA */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                Editar Administrador: {selectedUser.username}
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nombre de Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="admin@tudominio.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Nueva Contraseña (Opcional)
                </label>
                <p className="text-[11px] text-slate-400">
                  Deja este campo en blanco si no deseas cambiar la contraseña del usuario.
                </p>
                <div className="relative">
                  <Key className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Dejar vacío para mantener actual"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={editing}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
                >
                  {editing ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
