import crypto from 'crypto';

export const KNOWN_BANK_SERVICERS = [
  'servihabitat',
  'solvia',
  'aliseda',
  'haya real estate',
  'haya',
  'sareb',
  'altamira',
  'casaktua',
  'diglo',
  'anticipa',
  'inmocaixa',
  'caixabank',
  'banco santander',
  'bbva',
  'banco sabadell',
  'activo bancario',
  'inmueble de banco',
  'embargo bancario',
  'procedencia bancaria',
  'adjudicado bancario',
];

export function isBankEntity(agency?: string, title?: string, text?: string): boolean {
  const agencyLower = (agency || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const textLower = (text || '').toLowerCase();

  // Check agency name
  for (const b of KNOWN_BANK_SERVICERS) {
    if (agencyLower.includes(b)) return true;
  }

  // Check specific badges in title or text
  if (
    titleLower.includes('inmueble de banco') ||
    titleLower.includes('activo bancario') ||
    titleLower.includes('procedencia bancaria') ||
    titleLower.includes('embargo bancario')
  ) {
    return true;
  }

  if (
    textLower.includes('inmueble procedente de banco') ||
    textLower.includes('propiedad de entidad bancaria') ||
    textLower.includes('activo de entidad financiera') ||
    textLower.includes('procedencia bancaria')
  ) {
    return true;
  }

  return false;
}

export function parsePrice(text: string | null | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9]/g, '');
  return parseInt(clean, 10) || 0;
}

export function parseSqm(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+[\d.,]*)\s*m/i);
  if (match) {
    const num = match[1].replace(/[^0-9]/g, '');
    return parseInt(num, 10) || undefined;
  }
  return undefined;
}

export function parseRooms(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+)\s*(hab|habs|dorm|dormitorios|habitación|habitaciones)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

export function parseBathrooms(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+)\s*(baño|baños|wc|bany|banys)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
}

export function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

export function generateListingId(portal: string, portalIdOrUrl: string): string {
  return `${portal}_${hashString(portalIdOrUrl)}`;
}

export function calculatePriceDrop(
  oldPrice: number,
  newPrice: number
): { diff: number; percentage: number; isDrop: boolean } {
  const diff = oldPrice - newPrice;
  const percentage = oldPrice > 0 ? (diff / oldPrice) * 100 : 0;
  return {
    diff: Math.abs(diff),
    percentage: Math.round(Math.abs(percentage) * 10) / 10,
    isDrop: diff > 0,
  };
}
