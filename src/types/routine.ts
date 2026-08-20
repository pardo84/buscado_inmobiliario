import { OperationType, PropertyType } from './listing.js';

export interface RoutineFilters {
  propertyTypes: PropertyType[];
  operationType: OperationType;
  locations: string[]; // ['all_granollers', 'gr_centre', 'cardedeu', 'la_roca', 'les_franqueses']
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  minBathrooms?: number;
  minSqm?: number;
  mustHaveElevator?: boolean;
  mustHaveParking?: boolean;
  mustHaveTerrace?: boolean;
  mustHavePool?: boolean;
  bankPropertiesOnly?: boolean;
  excludeBankProperties?: boolean;
  portals?: string[]; // ['habitaclia', 'fotocasa', 'pisos', 'banks']
}

export interface SearchRoutine {
  id: number;
  userId: number;
  name: string;
  filters: RoutineFilters;
  intervalMinutes: number; // e.g. 15, 30, 60, 120, 240, 1440
  isActive: boolean;
  lastRunAt?: string;
  lastFoundCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoutineInput {
  userId: number;
  name: string;
  filters: RoutineFilters;
  intervalMinutes: number;
}
