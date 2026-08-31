import { FC, useEffect, useState } from 'react';
import {
  Copy,
  Edit2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Tv,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import {
  CreateCustomerPayload,
  CustomerItem,
  createCustomer,
  deleteCustomer,
  getCustomersList,
  renewCustomer,
  toggleCustomerStatus,
  updateCustomer,
} from '@/services/AdminCustomerService';

export const AdminCustomersPage: FC = () => {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);

  // Formulario Creación
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [registerPayment, setRegisterPayment] = useState(true);
  const [amount, setAmount] = useState('10.00');
  const currency = 'USD';
  const [planName, setPlanName] = useState('Mensual');
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');

  // Formulario Renovación
  const [renewDate, setRenewDate] = useState('');
  const [renewAmount, setRenewAmount] = useState('10.00');
  const [renewPlanName, setRenewPlanName] = useState('Renovación Mensual');
  const [renewPaymentMethod, setRenewPaymentMethod] = useState('Transferencia');

  // Helper para fijar fecha a partir de hoy
  const addDaysToNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  };

  const addMonthsToNow = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 16);
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const list = await getCustomersList(searchQuery, statusFilter);
      setCustomers(list);
    } catch (e) {
      console.error('Error fetching customers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, [searchQuery, statusFilter]);

  const openCreateModal = () => {
    setName('');
    setContact('');
    setNotes('');
    setExpirationDate(addMonthsToNow(1));
    setRegisterPayment(true);
    setAmount('10.00');
    setPlanName('Mensual');
    setPaymentMethod('Transferencia');
    setIsCreateModalOpen(true);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !expirationDate) {
      toast({
        title: 'Error',
        description: 'El nombre y la fecha de vencimiento son requeridos.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload: CreateCustomerPayload = {
        name: name.trim(),
        contact: contact.trim() || undefined,
        notes: notes.trim() || undefined,
        expiration_date: new Date(expirationDate).toISOString(),
        register_payment: registerPayment,
        amount: registerPayment ? parseFloat(amount) || 0 : 0,
        currency,
        plan_name: planName,
        payment_method: paymentMethod,
      };

      await createCustomer(payload);
      toast({
        title: '¡Cliente Creado!',
        description: `El cliente ${name} fue registrado con éxito.`,
        variant: 'success',
      });
      setIsCreateModalOpen(false);
      void loadCustomers();
    } catch (err: any) {
      toast({
        title: 'Error al registrar',
        description: err.response?.data?.detail || 'No se pudo crear el cliente.',
        variant: 'destructive',
      });
    }
  };

  const openEditModal = (c: CustomerItem) => {
    setSelectedCustomer(c);
    setName(c.name);
    setContact(c.contact || '');
    setNotes(c.notes || '');
    const d = new Date(c.expiration_date);
    setExpirationDate(d.toISOString().slice(0, 16));
    setIsEditModalOpen(true);
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    try {
      await updateCustomer(selectedCustomer.id, {
        name: name.trim(),
        contact: contact.trim() || undefined,
        notes: notes.trim() || undefined,
        expiration_date: new Date(expirationDate).toISOString(),
        status: selectedCustomer.status,
      });
      toast({
        title: 'Cliente Actualizado',
        description: 'Los cambios fueron guardados.',
        variant: 'success',
      });
      setIsEditModalOpen(false);
      void loadCustomers();
    } catch (err: any) {
      toast({
        title: 'Error al editar',
        description: err.response?.data?.detail || 'No se pudo actualizar.',
        variant: 'destructive',
      });
    }
  };

  const openRenewModal = (c: CustomerItem) => {
    setSelectedCustomer(c);
    // Si la fecha ya venció, sumar 1 mes desde hoy; si no, sumar 1 mes a su fecha actual
    const currentExp = new Date(c.expiration_date);
    const base = currentExp > new Date() ? currentExp : new Date();
    base.setMonth(base.getMonth() + 1);
    setRenewDate(base.toISOString().slice(0, 16));
    setRenewAmount('10.00');
    setRenewPlanName('Renovación Mensual');
    setIsRenewModalOpen(true);
  };

  const handleRenewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !renewDate) return;

    try {
      await renewCustomer(selectedCustomer.id, {
        new_expiration_date: new Date(renewDate).toISOString(),
        amount: parseFloat(renewAmount) || 0,
        currency: 'USD',
        plan_name: renewPlanName,
        payment_method: renewPaymentMethod,
      });
      toast({
        title: 'Suscripción Renovada',
        description: `Suscripción de ${selectedCustomer.name} extendida con éxito.`,
        variant: 'success',
      });
      setIsRenewModalOpen(false);
      void loadCustomers();
    } catch (err: any) {
      toast({
        title: 'Error al renovar',
        description: err.response?.data?.detail || 'No se pudo renovar.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (c: CustomerItem) => {
    try {
      const res = await toggleCustomerStatus(c.id);
      toast({
        title: res.new_status === 'ACTIVE' ? 'Cliente Activado' : 'Cliente Suspendido',
        description: `El estado de ${c.name} ahora es ${res.new_status}.`,
        variant: 'success',
      });
      void loadCustomers();
    } catch (e) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (c: CustomerItem) => {
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente a ${c.name}?`)) {
      return;
    }
    try {
      await deleteCustomer(c.id);
      toast({
        title: 'Cliente Eliminado',
        description: `${c.name} fue eliminado.`,
        variant: 'success',
      });
      void loadCustomers();
    } catch (e) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el cliente.',
        variant: 'destructive',
      });
    }
  };

  const copyStremioLink = (c: CustomerItem) => {
    const stremioUrl = `stremio://${window.location.host}/u/${c.uuid_token}/manifest.json`;
    navigator.clipboard.writeText(stremioUrl);
    toast({
      title: '¡Enlace de Stremio Copiado!',
      description: `Enlace copiado para ${c.name}. Puedes enviárselo para instalar con 1 clic.`,
      variant: 'success',
      duration: 6000,
    });
  };

  const copyHttpsLink = (c: CustomerItem) => {
    const origin = window.location.origin;
    const httpsUrl = `${origin}/u/${c.uuid_token}/manifest.json`;
    navigator.clipboard.writeText(httpsUrl);
    toast({
      title: '¡URL del Manifiesto Copiada!',
      description: `URL HTTPS copiada: ${httpsUrl}`,
      variant: 'success',
      duration: 6000,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Clientes y Suscripciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestiona accesos individuales, fechas de vencimiento en calendario y cobros
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 rounded-xl shadow-lg shadow-indigo-600/30"
        >
          <Plus className="w-4 h-4" />
          Registrar Nuevo Cliente
        </Button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-xl flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Buscador */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o contacto..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {/* Filtros de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { label: 'Todos', value: 'ALL' },
            { label: 'Activos', value: 'ACTIVE' },
            { label: 'Por Vencer (3d)', value: 'EXPIRING_SOON' },
            { label: 'Vencidos', value: 'EXPIRED' },
            { label: 'Suspendidos', value: 'SUSPENDED' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5">Vencimiento</th>
                <th className="px-5 py-3.5">Total Cobrado</th>
                <th className="px-5 py-3.5">Enlace Stremio</th>
                <th className="px-5 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando lista de clientes...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No se encontraron clientes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const expDate = new Date(c.expiration_date);
                  const formattedExp = expDate.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white">{c.name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          {c.contact ? (
                            <a
                              href={`https://wa.me/${c.contact.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-400" />
                              {c.contact}
                            </a>
                          ) : (
                            <span>Sin contacto</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {c.computed_status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Activo
                          </span>
                        )}
                        {c.computed_status === 'EXPIRING_SOON' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            Por Vencer
                          </span>
                        )}
                        {c.computed_status === 'EXPIRED' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Vencido (Bloqueado)
                          </span>
                        )}
                        {c.computed_status === 'SUSPENDED' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Suspendido
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-200 text-xs">
                          {formattedExp}
                        </div>
                      </td>

                      <td className="px-5 py-4 font-semibold text-emerald-400 text-xs">
                        ${c.total_paid} USD
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => copyStremioLink(c)}
                            className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs gap-1.5 py-1 px-3"
                          >
                            <Tv className="w-3.5 h-3.5" />
                            Copiar Enlace
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyHttpsLink(c)}
                            title="Copiar URL HTTPS del Manifiesto"
                            className="text-slate-400 hover:text-white p-2 rounded-xl"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openRenewModal(c)}
                            title="Renovar Suscripción"
                            className="text-emerald-400 hover:bg-emerald-500/10 p-2 rounded-xl"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(c)}
                            title={c.status === 'ACTIVE' ? 'Pausar / Suspender' : 'Activar'}
                            className={`p-2 rounded-xl ${
                              c.status === 'ACTIVE'
                                ? 'text-amber-400 hover:bg-amber-500/10'
                                : 'text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {c.status === 'ACTIVE' ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditModal(c)}
                            title="Editar Datos"
                            className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-xl"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(c)}
                            title="Eliminar Cliente"
                            className="text-rose-400 hover:bg-rose-500/10 p-2 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL CREAR CLIENTE ================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5 my-8 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold">Registrar Nuevo Cliente</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Carlos Gómez"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Contacto (WhatsApp / Teléfono / Email)
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Selector de Calendario y Presets */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Fecha y Hora de Vencimiento (Calendario) *
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="datetime-local"
                    required
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none [color-scheme:dark]"
                  />
                </div>
                {/* Botones Presets Rápidos */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">Presets rápidos:</span>
                  {[
                    { label: '+7 Días', fn: () => setExpirationDate(addDaysToNow(7)) },
                    { label: '+1 Mes', fn: () => setExpirationDate(addMonthsToNow(1)) },
                    { label: '+3 Meses', fn: () => setExpirationDate(addMonthsToNow(3)) },
                    { label: '+6 Meses', fn: () => setExpirationDate(addMonthsToNow(6)) },
                    { label: '+1 Año', fn: () => setExpirationDate(addMonthsToNow(12)) },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={p.fn}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium rounded-lg text-slate-300 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Registro de Pago Inicial */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Registrar Cobro Inicial
                  </label>
                  <input
                    type="checkbox"
                    checked={registerPayment}
                    onChange={(e) => setRegisterPayment(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                </div>

                {registerPayment && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Monto ($ USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Método de Pago</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Zelle">Zelle</option>
                        <option value="PayPal">PayPal</option>
                        <option value="Tarjeta / Bizum">Bizum / Tarjeta</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Notas Internas (Opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dispositivo Smart TV en sala..."
                  rows={2}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                  Guardar y Generar Enlace
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL RENOVAR ================= */}
      {isRenewModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold">Renovar Suscripción</h2>
              <button
                onClick={() => setIsRenewModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-400">
              Cliente: <span className="font-semibold text-white">{selectedCustomer.name}</span>
            </p>

            <form onSubmit={handleRenewCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nueva Fecha de Vencimiento (Calendario)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={renewDate}
                  onChange={(e) => setRenewDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none [color-scheme:dark]"
                />
                {/* Botones Presets Rápidos */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[11px] text-slate-500">Extender:</span>
                  {[
                    { label: '+7 Días', fn: () => setRenewDate(addDaysToNow(7)) },
                    { label: '+1 Mes', fn: () => setRenewDate(addMonthsToNow(1)) },
                    { label: '+3 Meses', fn: () => setRenewDate(addMonthsToNow(3)) },
                    { label: '+6 Meses', fn: () => setRenewDate(addMonthsToNow(6)) },
                    { label: '+1 Año', fn: () => setRenewDate(addMonthsToNow(12)) },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={p.fn}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-medium rounded-lg text-slate-300 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Monto Cobrado ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={renewAmount}
                    onChange={(e) => setRenewAmount(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Método de Pago</label>
                  <select
                    value={renewPaymentMethod}
                    onChange={(e) => setRenewPaymentMethod(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Zelle">Zelle</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Bizum / Tarjeta">Bizum / Tarjeta</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRenewModalOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  Confirmar Renovación
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL EDITAR ================= */}
      {isEditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold">Editar Cliente</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Contacto
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Fecha de Vencimiento (Calendario)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Notas
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
