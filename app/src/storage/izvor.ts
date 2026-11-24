/** Mjesto gdje živi datoteka s podacima. */
export interface Izvor {
  vrsta: 'onedrive' | 'lokalno' | 'preuzimanje';
  opis: string;
  ucitaj(): Promise<ArrayBuffer>;
  spremi(data: ArrayBuffer): Promise<void>;
}

export class SukobVerzija extends Error {
  constructor() {
    super('Datoteka je u međuvremenu promijenjena na drugom uređaju. Učitaj je ponovno pa ponovi izmjenu.');
  }
}

const KLJUC = 'rezije.izvor';

export interface SpremljeniIzvor {
  vrsta: 'onedrive' | 'lokalno';
  putanja?: string;
}

export const zapamtiIzvor = (s: SpremljeniIzvor | null) =>
  s ? localStorage.setItem(KLJUC, JSON.stringify(s)) : localStorage.removeItem(KLJUC);

export function zapamceniIzvor(): SpremljeniIzvor | null {
  try {
    return JSON.parse(localStorage.getItem(KLJUC) ?? 'null');
  } catch {
    return null;
  }
}
