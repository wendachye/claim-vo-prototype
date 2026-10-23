// Explicit, per-assessment prototype terms. No project progress or tracker is a ledger.
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const blank = (value) => value === null || value === undefined || (typeof value === 'string' && !value.trim());
const maxInteger = BigInt(Number.MAX_SAFE_INTEGER);
const fields = new Set(['version', 'billingMethod', 'retentionMode', 'retentionRate', 'retentionCap', 'previousNetValue', 'priorReference']);

export const defaultClaimBasis = () => ({ version: 1, billingMethod: 'quantityRate', retentionMode: 'none', retentionRate: '', retentionCap: '', previousNetValue: '', priorReference: '' });

function decimal(value, precision = 4, signed = false) {
  if (blank(value)) return null;
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) return undefined;
  const source = String(value).trim();
  if (source.length > 64) return undefined;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match || !(match[2] || match[3])) return undefined;
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 20) return undefined;
  let digits = `${match[2] || '0'}${match[3] || ''}`.replace(/^0+/, '') || '0';
  let scale = (match[3] || '').length - exponent;
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  while (scale > 0 && digits.endsWith('0')) { digits = digits.slice(0, -1) || '0'; scale -= 1; }
  if (scale > precision) return undefined;
  const coefficient = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
  if ((!signed && coefficient < 0n) || coefficient > maxInteger || coefficient < -maxInteger) return undefined;
  return { coefficient, scale };
}
const atScale = (value, scale) => value.coefficient * 10n ** BigInt(scale - value.scale);
const equalDecimal = (a, b) => a && b && atScale(a, Math.max(a.scale, b.scale)) === atScale(b, Math.max(a.scale, b.scale));

// Reject input precision that Number would silently discard before it is saved.
export function claimBasisNumber(value, precision = 2) {
  const parsed = decimal(value, precision);
  if (parsed === null) return null;
  if (!parsed || (precision === 2 && atScale(parsed, 2) > maxInteger)) return NaN;
  const number = Number(parsed.coefficient) / 10 ** parsed.scale;
  return Number.isFinite(number) && equalDecimal(parsed, decimal(number, precision)) ? number : NaN;
}
function cents(value) {
  const parsed = decimal(value, 2, true);
  return parsed ? atScale(parsed, 2) : null;
}
function fromCents(value) {
  if (value === null || value > maxInteger || value < -maxInteger) return null;
  const number = Number(value) / 100;
  return cents(number) === value ? number : null;
}
const roundRatio = (numerator, denominator) => numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);

export function claimBasisProduct(quantity, rate) {
  const left = decimal(quantity, 4), right = decimal(rate, 4);
  if (!left || !right) return null;
  const numerator = left.coefficient * right.coefficient * 100n;
  return fromCents(roundRatio(numerator, 10n ** BigInt(left.scale + right.scale)));
}
export function claimBasisSum(values) {
  const amounts = values.map(cents);
  return amounts.some(value => value === null) ? null : fromCents(amounts.reduce((sum, value) => sum + value, 0n));
}
export function claimBasisDifference(left, right) {
  const a = cents(left), b = cents(right);
  return a === null || b === null ? null : fromCents(a - b);
}

export function normalizeClaimBasis(input, priorConfirmed = false) {
  const errors = [];
  const raw = record(input) ? input : {};
  if (!record(input)) errors.push('Use valid claim basis settings.');
  if (raw.version !== 1) errors.push('Use the supported claim basis version.');
  for (const key of Object.keys(raw)) if (!fields.has(key)) errors.push(`Unsupported claim basis setting: ${key}.`);
  const billingMethod = raw.billingMethod ?? '';
  const retentionMode = raw.retentionMode ?? '';
  if (!['quantityRate', 'unsupported', ''].includes(billingMethod)) errors.push('Use a valid billing method.');
  if (!['none', 'rateCap', ''].includes(retentionMode)) errors.push('Use a valid retention mode.');
  const retentionRate = retentionMode === 'rateCap' ? claimBasisNumber(raw.retentionRate, 4) : 0;
  const retentionCap = retentionMode === 'rateCap' ? claimBasisNumber(raw.retentionCap, 2) : null;
  let previousNetValue = claimBasisNumber(raw.previousNetValue, 2);
  if (previousNetValue === null && priorConfirmed) previousNetValue = 0;
  if (Number.isNaN(retentionRate) || retentionRate > 100) errors.push('Retention rate must be between 0 and 100, with at most 4 decimal places.');
  if (Number.isNaN(retentionCap)) errors.push('Retention cap must be a non-negative amount with at most 2 decimal places.');
  if (Number.isNaN(previousNetValue)) errors.push('Previous submitted net must be a non-negative amount with at most 2 decimal places.');
  if (raw.priorReference != null && typeof raw.priorReference !== 'string') errors.push('Use a text reference for previous submissions.');
  return { value: {
    version: 1,
    billingMethod: typeof billingMethod === 'string' ? billingMethod : '',
    retentionMode: typeof retentionMode === 'string' ? retentionMode : '',
    retentionRate: Number.isNaN(retentionRate) || retentionRate > 100 ? null : retentionRate,
    retentionCap: Number.isNaN(retentionCap) ? null : retentionCap,
    previousNetValue: Number.isNaN(previousNetValue) ? null : previousNetValue,
    priorReference: typeof raw.priorReference === 'string' ? raw.priorReference.trim() : '',
  }, errors };
}

export function applyClaimBasis(basis, grossTotals, currency, adjustmentReason = '') {
  const issues = [];
  const supported = basis.billingMethod === 'quantityRate' && currency === 'SGD';
  if (basis.billingMethod !== 'quantityRate') issues.push('Use cumulative quantity × rate; other billing methods need review.');
  if (currency !== 'SGD') issues.push('This claim basis supports SGD only. Review the currency before preparation.');
  if (!['none', 'rateCap'].includes(basis.retentionMode)) issues.push('Choose how retention applies to this claim.');
  if (basis.retentionMode === 'rateCap' && basis.retentionRate === null) issues.push('Enter the retention rate.');
  if (basis.retentionMode === 'rateCap' && basis.retentionCap === null) issues.push('Enter the cumulative retention cap.');
  if (basis.previousNetValue === null) issues.push('Confirm the previous submitted net amount; blank means zero only after checking previous claims.');
  const gross = cents(grossTotals.cumulativeValue), priorGross = cents(grossTotals.previousValue), priorNet = cents(basis.previousNetValue);
  let retained = null;
  if (supported && gross !== null && basis.retentionMode === 'none') retained = 0n;
  if (supported && gross !== null && basis.retentionMode === 'rateCap') {
    const rate = decimal(basis.retentionRate, 4), cap = cents(basis.retentionCap);
    if (rate && cap !== null) {
      const withheld = roundRatio(gross * rate.coefficient, 100n * 10n ** BigInt(rate.scale));
      retained = withheld < cap ? withheld : cap;
    }
  }
  const retentionValue = fromCents(retained);
  const netCumulativeValue = gross === null || retained === null ? null : fromCents(gross - retained);
  const grossCurrentValue = claimBasisDifference(grossTotals.cumulativeValue, grossTotals.previousValue);
  const currentValue = grossTotals.previousValue === null ? null : claimBasisDifference(netCumulativeValue, basis.previousNetValue);
  if (priorGross !== null && priorNet !== null) {
    if (priorNet > priorGross) issues.push('Previous submitted net exceeds gross amounts claimed before. Reconcile the item totals and prior net amount.');
    if (retained !== null && retained < priorGross - priorNet) issues.push('These settings would release previously held retention. Retention releases need a separate supported basis.');
  }
  if (((grossTotals.previousValue ?? 0) > 0 || (basis.previousNetValue ?? 0) > 0) && !basis.priorReference) issues.push('Add the reference for previous submitted amounts.');
  if (currentValue !== null && currentValue < 0 && !adjustmentReason) issues.push('Explain the negative net adjustment before preparing.');
  if ((gross !== null && priorGross !== null && grossCurrentValue === null)
    || (gross !== null && retained !== null && (retentionValue === null || netCumulativeValue === null))
    || (netCumulativeValue !== null && priorNet !== null && grossTotals.previousValue !== null && currentValue === null)) {
    issues.push('The calculation exceeds the supported amount limit.');
  }
  return { totals: { ...grossTotals, currentValue, retentionValue, netCumulativeValue, previousNetValue: basis.previousNetValue, grossCurrentValue }, issues };
}
