export enum Town {
  GRANOLLERS = 'Granollers',
  CARDEDEU = 'Cardedeu',
  LA_ROCA = 'La Roca del Vallès',
  LES_FRANQUESES = 'Les Franqueses del Vallès',
}

export interface NeighborhoodInfo {
  id: string;
  name: string;
  town: Town;
  slugs: {
    habitaclia?: string;
    fotocasa?: string;
    pisos?: string;
  };
}

export const GRANOLLERS_NEIGHBORHOODS: NeighborhoodInfo[] = [
  { id: 'centre', name: 'Centre', town: Town.GRANOLLERS, slugs: { habitaclia: 'centre' } },
  { id: 'font_verda', name: 'Font Verda', town: Town.GRANOLLERS, slugs: { habitaclia: 'font_verda' } },
  { id: 'tres_torres', name: 'Tres Torres', town: Town.GRANOLLERS, slugs: { habitaclia: 'tres_torres' } },
  { id: 'congost', name: 'Congost', town: Town.GRANOLLERS, slugs: { habitaclia: 'congost' } },
  { id: 'ponent', name: 'Ponent', town: Town.GRANOLLERS, slugs: { habitaclia: 'ponent' } },
  { id: 'hostalets', name: 'Hostalets', town: Town.GRANOLLERS, slugs: { habitaclia: 'hostalets' } },
  { id: 'primer_de_maig', name: 'Primer de Maig', town: Town.GRANOLLERS, slugs: { habitaclia: 'primer_de_maig' } },
  { id: 'palou', name: 'Palou', town: Town.GRANOLLERS, slugs: { habitaclia: 'palou' } },
  { id: 'sant_miquel', name: 'Sant Miquel', town: Town.GRANOLLERS, slugs: { habitaclia: 'sant_miquel' } },
  { id: 'can_monic', name: 'Can Mònic', town: Town.GRANOLLERS, slugs: { habitaclia: 'can_monic' } },
  { id: 'can_bassa', name: 'Can Bassa', town: Town.GRANOLLERS, slugs: { habitaclia: 'can_bassa' } },
  { id: 'lledoner', name: 'Lledoner', town: Town.GRANOLLERS, slugs: { habitaclia: 'lledoner' } },
  { id: 'terra_alta', name: 'Terra Alta', town: Town.GRANOLLERS, slugs: { habitaclia: 'terra_alta' } },
  { id: 'joan_prim', name: 'Joan Prim', town: Town.GRANOLLERS, slugs: { habitaclia: 'joan_prim' } },
];

export const ALL_LOCATIONS: { id: string; name: string; town: Town; isTown: boolean }[] = [
  { id: 'all_granollers', name: 'Granollers (Todo)', town: Town.GRANOLLERS, isTown: true },
  ...GRANOLLERS_NEIGHBORHOODS.map(n => ({ id: `gr_${n.id}`, name: `Granollers - ${n.name}`, town: Town.GRANOLLERS, isTown: false })),
  { id: 'cardedeu', name: 'Cardedeu', town: Town.CARDEDEU, isTown: true },
  { id: 'la_roca', name: 'La Roca del Vallès', town: Town.LA_ROCA, isTown: true },
  { id: 'les_franqueses', name: 'Les Franqueses del Vallès', town: Town.LES_FRANQUESES, isTown: true },
];
