import { del, get, set } from 'idb-keyval';
import type { Izvor } from './izvor';

/**
 * Lokalna datoteka (npr. u OneDrive mapi na računalu) preko File System Access API-ja
 * (Chrome, Edge na računalu). Ručka datoteke se pamti u IndexedDB.
 */

type Ruka = FileSystemFileHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
};

declare global {
  interface Window {
    showOpenFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle>;
  }
}

const KLJUC = 'rezije.lokalna-datoteka';
const TIPOVI = [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

export const podrzanLokalni = () => typeof window !== 'undefined' && !!window.showOpenFilePicker;

function izRuke(r: Ruka): Izvor {
  return {
    vrsta: 'lokalno',
    opis: `Datoteka na računalu: ${r.name}`,
    async ucitaj() {
      return (await r.getFile()).arrayBuffer();
    },
    async spremi(data) {
      const w = await r.createWritable();
      await w.write(data);
      await w.close();
    },
  };
}

export async function odaberiLokalnu(): Promise<Izvor> {
  const [r] = await window.showOpenFilePicker!({ types: TIPOVI, multiple: false });
  await (r as Ruka).requestPermission({ mode: 'readwrite' });
  await set(KLJUC, r);
  return izRuke(r as Ruka);
}

export async function novaLokalna(data: ArrayBuffer): Promise<Izvor> {
  const r = (await window.showSaveFilePicker!({ types: TIPOVI, suggestedName: 'rezije-podaci.xlsx' })) as Ruka;
  const izvor = izRuke(r);
  await izvor.spremi(data);
  await set(KLJUC, r);
  return izvor;
}

/** Zapamćena datoteka. `trazi` = smije li tražiti dozvolu (mora biti nakon klika). */
export async function zapamcenaLokalna(trazi: boolean): Promise<Izvor | 'treba-dozvolu' | null> {
  const r = (await get(KLJUC)) as Ruka | undefined;
  if (!r) return null;
  let st = await r.queryPermission({ mode: 'readwrite' });
  if (st !== 'granted' && trazi) st = await r.requestPermission({ mode: 'readwrite' });
  if (st !== 'granted') return 'treba-dozvolu';
  return izRuke(r);
}

export const zaboraviLokalnu = () => del(KLJUC);

/** Za preglednike bez File System Access API-ja: učitaj kroz <input>, spremanje = preuzimanje. */
export function izvorIzDatoteke(f: File): Izvor {
  return {
    vrsta: 'preuzimanje',
    opis: `${f.name} (izmjene se spremaju preuzimanjem)`,
    ucitaj: () => f.arrayBuffer(),
    async spremi(data) {
      void data;
    },
  };
}

export function preuzmi(data: ArrayBuffer, naziv = 'rezije-podaci.xlsx') {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = naziv;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
