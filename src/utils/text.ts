import crypto from 'crypto';
import { PropertyType } from '../types/listing.js';

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

export function detectPropertyType(url: string, title: string, description?: string): PropertyType {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();

  // 1. Check Parking / Garaje first (avoid false matches with parking amenities)
  if (
    urlLower.includes('/garaje') ||
    urlLower.includes('/parking') ||
    urlLower.includes('/parkings') ||
    urlLower.includes('/garajes') ||
    titleLower.startsWith('garaje') ||
    titleLower.startsWith('parking') ||
    titleLower.startsWith('plaza de garaje') ||
    titleLower.startsWith('plaza de parking') ||
    titleLower.startsWith('aparcamiento') ||
    titleLower.startsWith('aparcament')
  ) {
    return PropertyType.PARKING;
  }

  // 2. Check Terreno / Solar / Parcela
  if (
    urlLower.includes('/terreno') ||
    urlLower.includes('/terrenos') ||
    urlLower.includes('/solar') ||
    urlLower.includes('/parcela') ||
    titleLower.startsWith('terreno') ||
    titleLower.startsWith('solar') ||
    titleLower.startsWith('parcela') ||
    titleLower.startsWith('finca rustica') ||
    titleLower.startsWith('finca rústica') ||
    titleLower.startsWith('terreny')
  ) {
    return PropertyType.TERRENO;
  }

  // 3. Check Local / Nave / Oficina
  if (
    urlLower.includes('/local') ||
    urlLower.includes('/locales') ||
    urlLower.includes('/nave') ||
    urlLower.includes('/oficina') ||
    titleLower.startsWith('local') ||
    titleLower.startsWith('nave') ||
    titleLower.startsWith('oficina') ||
    titleLower.startsWith('despacho')
  ) {
    return PropertyType.LOCAL;
  }

  // 4. Check Duplex
  if (
    urlLower.includes('/duplex') ||
    urlLower.includes('-duplex') ||
    titleLower.includes('dúplex') ||
    titleLower.includes('duplex')
  ) {
    return PropertyType.DUPLEX;
  }

  // 5. Check Atico
  if (
    urlLower.includes('/atico') ||
    urlLower.includes('-atico') ||
    urlLower.includes('/atic') ||
    titleLower.includes('ático') ||
    titleLower.includes('atico') ||
    titleLower.includes('àtic') ||
    titleLower.includes('atic') ||
    titleLower.includes('sobreático') ||
    titleLower.includes('sobreatico')
  ) {
    return PropertyType.ATICO;
  }

  // 6. Check Casa / Chalet / Torre / Masia / Adosada / Pareada
  if (
    urlLower.includes('/casa-') ||
    urlLower.includes('/casas-') ||
    urlLower.includes('-casa-') ||
    urlLower.includes('-casas-') ||
    urlLower.includes('/chalet-') ||
    urlLower.includes('/chalets-') ||
    urlLower.includes('/torre-') ||
    urlLower.includes('/masia-') ||
    urlLower.includes('/villa-') ||
    urlLower.includes('inmueble-casa_') ||
    titleLower.includes('casa') ||
    titleLower.includes('chalet') ||
    titleLower.includes('chale') ||
    titleLower.includes('torre') ||
    titleLower.includes('masia') ||
    titleLower.includes('masía') ||
    titleLower.includes('adosad') ||
    titleLower.includes('adosat') ||
    titleLower.includes('paread') ||
    titleLower.includes('parellada') ||
    titleLower.includes('unifamiliar') ||
    titleLower.includes('villa') ||
    titleLower.includes('xalet') ||
    titleLower.includes('torreta')
  ) {
    return PropertyType.CASA;
  }

  // 7. Check Piso / Apartamento / Planta baja / Estudio
  if (
    urlLower.includes('/piso-') ||
    urlLower.includes('/pisos-') ||
    urlLower.includes('-piso-') ||
    urlLower.includes('-pisos-') ||
    urlLower.includes('/apartamento-') ||
    urlLower.includes('/planta-baja-') ||
    urlLower.includes('/estudio-') ||
    urlLower.includes('inmueble-piso_') ||
    titleLower.includes('piso') ||
    titleLower.includes('pis ') ||
    titleLower.startsWith('pis') ||
    titleLower.includes('apartamento') ||
    titleLower.includes('apartament') ||
    titleLower.includes('planta baja') ||
    titleLower.includes('planta baixa') ||
    titleLower.includes('estudio') ||
    titleLower.includes('estudi') ||
    titleLower.includes('loft')
  ) {
    return PropertyType.PISO;
  }

  // Secondary check on description/text if title is ambiguous
  if (
    descLower.includes('casa unifamiliar') ||
    descLower.includes('casa adosada') ||
    descLower.includes('chalet independiente') ||
    descLower.includes('espectacular casa') ||
    descLower.includes('preciosa casa')
  ) {
    return PropertyType.CASA;
  }

  return PropertyType.PISO;
}

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
