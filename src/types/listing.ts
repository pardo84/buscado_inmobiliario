export enum PropertyType {
  PISO = 'piso', // Flat / Apartment
  CASA = 'casa', // House / Chalet / Adosado
  DUPLEX = 'duplex', // Duplex
  ATICO = 'atico', // Penthouse
  PARKING = 'parking', // Parking space / Garage
  TERRENO = 'terreno', // Land / Plot
  LOCAL = 'local', // Commercial premises / Office
  TRASTERO = 'trastero', // Storage
  CUALQUIERA = 'cualquiera', // Any
}

export enum OperationType {
  VENTA = 'comprar',
  ALQUILER = 'alquiler',
}

export enum ListingStatus {
  ACTIVE = 'active',
  PRICE_DROPPED = 'price_dropped',
  PRICE_INCREASED = 'price_increased',
  RESERVED = 'reserved',
  SOLD = 'sold',
  REMOVED = 'removed',
  UNKNOWN = 'unknown',
}

export interface PropertyListing {
  id: string; // Unique hash or portal ID
  portal: string; // habitaclia, fotocasa, pisos, servihabitat, solvia, etc.
  portalId?: string;
  url: string;
  title: string;
  price: number;
  previousPrice?: number;
  currency: string;
  pricePerSqm?: number;
  propertyType: PropertyType;
  operationType: OperationType;
  town: string;
  neighborhood?: string;
  address?: string;
  rooms?: number;
  bathrooms?: number;
  sqm?: number;
  features: string[]; // ['ascensor', 'parking', 'terraza', 'piscina', 'balcon', 'jardin']
  description?: string;
  photos: string[];
  agency?: string;
  isBankProperty: boolean;
  publishedAt?: string;
  status: ListingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ListingSnapshot {
  id?: number;
  listingId: string;
  price: number;
  status: ListingStatus;
  checkedAt: string;
}

export interface TrackedListing {
  id?: number;
  userId: number;
  listingId: string;
  url: string;
  portal: string;
  title: string;
  initialPrice: number;
  currentPrice: number;
  propertyType: string;
  town: string;
  neighborhood?: string;
  photoUrl?: string;
  status: ListingStatus;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string;
}
