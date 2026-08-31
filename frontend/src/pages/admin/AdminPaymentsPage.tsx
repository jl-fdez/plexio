import { FC, useEffect, useState } from 'react';
import { DollarSign, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentItem, getRecentPayments } from '@/services/AdminCustomerService';

export const AdminPaymentsPage: FC = () => {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data = await getRecentPayments(100);
      setPayments(data);
    } catch (e) {
      console.error('Error fetching payments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Historial de Cobros y Pagos
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Registro de todos los pagos ingresados por las suscripciones de tus clientes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            className="border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 gap-2 rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Tarjeta de Resumen */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-xl flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Recaudado en Registros
          </span>
          <div className="text-2xl md:text-3xl font-bold text-emerald-400 mt-1">
            ${totalCollected.toFixed(2)} USD
          </div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <DollarSign className="w-6 h-6" />
        </div>
      </div>

      {/* Tabla de Pagos */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Fecha</th>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Plan / Concepto</th>
                <th className="px-5 py-3.5">Método de Pago</th>
                <th className="px-5 py-3.5">Monto</th>
                <th className="px-5 py-3.5">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando pagos...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No se han registrado pagos todavía.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const pDate = new Date(p.payment_date).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-4 text-xs text-slate-400">{pDate}</td>
                      <td className="px-5 py-4 font-semibold text-white">{p.customer_name}</td>
                      <td className="px-5 py-4 text-xs text-slate-300">{p.plan_name || 'Suscripción'}</td>
                      <td className="px-5 py-4 text-xs text-slate-300">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200">
                          {p.payment_method || 'Efectivo'}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-emerald-400 text-sm">
                        +${p.amount.toFixed(2)} {p.currency}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400">{p.note || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
