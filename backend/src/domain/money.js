/**
 * El dinero se maneja SIEMPRE como enteros de pesos colombianos (COP no usa centavos
 * en la práctica). Nunca flotantes.
 */
export function assertPesos(value, label = 'valor') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} debe ser un entero de pesos no negativo (recibido: ${value})`);
  }
  return value;
}

const formatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** 85000 -> "$85.000" */
export function formatCOP(value) {
  return '$' + formatter.format(value);
}
