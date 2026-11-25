import { randomUUID } from 'node:crypto';

const RESULTS = new Set(['approved', 'pending', 'rejected']);

/**
 * Proveedor de pagos SIMULADO (dinero no real). Implementa el puerto
 * `paymentProvider.pay(request)`. Para conectar un proveedor real (SEDPE,
 * agregador de recaudos) se crea otro adaptador con la misma firma.
 *
 * `simulate` permite forzar el resultado desde el panel para demostrar
 * los caminos de rechazo y pendiente.
 */
export function createSimulatedPaymentProvider() {
  return {
    async pay({ simulate }) {
      const status = RESULTS.has(simulate) ? simulate : 'approved';
      return { status, providerReference: `SIM-${randomUUID().slice(0, 8).toUpperCase()}` };
    },
  };
}
