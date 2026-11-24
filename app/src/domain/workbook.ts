import * as XLSX from 'xlsx';
import { datumUExcelSerijski, excelSerijskiUDatum } from './dates';
import { ZADANE_POSTAVKE, type Podaci, type Postavke } from './types';

type Tip = 'tekst' | 'broj' | 'datum' | 'mjesec' | 'bool';
interface Stupac {
  kljuc: string;
  naslov: string;
  tip: Tip;
  sirina?: number;
}

/** Raspored tablica u datoteci. Naslovi su ono što se vidi u Excelu. */
const SHEME: Record<'rezije' | 'placanja' | 'ocitanja' | 'cjenici' | 'vauceri' | 'promjeneRata' | 'rasporedi', { sheet: string; stupci: Stupac[] }> = {
  rezije: {
    sheet: 'Režije',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 22 },
      { kljuc: 'naziv', naslov: 'Naziv', tip: 'tekst', sirina: 22 },
      { kljuc: 'vrsta', naslov: 'Vrsta', tip: 'tekst', sirina: 12 },
      { kljuc: 'grupa', naslov: 'Grupa', tip: 'tekst', sirina: 12 },
      { kljuc: 'aktivna', naslov: 'Aktivna', tip: 'bool', sirina: 8 },
      { kljuc: 'redoslijed', naslov: 'Redoslijed', tip: 'broj', sirina: 10 },
      { kljuc: 'iznosRate', naslov: 'Iznos rate', tip: 'broj', sirina: 11 },
      { kljuc: 'prvaRata', naslov: 'Prva rata', tip: 'datum', sirina: 11 },
      { kljuc: 'brojRata', naslov: 'Broj rata', tip: 'broj', sirina: 9 },
      { kljuc: 'zadnjaRata', naslov: 'Zadnja rata', tip: 'datum', sirina: 11 },
      { kljuc: 'danPlacanja', naslov: 'Dan plaćanja', tip: 'broj', sirina: 11 },
      { kljuc: 'platitelj', naslov: 'Platitelj', tip: 'tekst', sirina: 12 },
      { kljuc: 'rokOcitanja', naslov: 'Rok očitanja', tip: 'tekst', sirina: 12 },
      { kljuc: 'prijavaKome', naslov: 'Prijava očitanja', tip: 'tekst', sirina: 14 },
      { kljuc: 'napomena', naslov: 'Napomena', tip: 'tekst', sirina: 30 },
    ],
  },
  placanja: {
    sheet: 'Plaćanja',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'datum', naslov: 'Datum', tip: 'datum', sirina: 11 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 22 },
      { kljuc: 'zaMjesec', naslov: 'Za mjesec', tip: 'mjesec', sirina: 10 },
      { kljuc: 'iznos', naslov: 'Plaćeno', tip: 'broj', sirina: 10 },
      { kljuc: 'racun', naslov: 'Iznos računa', tip: 'broj', sirina: 12 },
      { kljuc: 'vauceri', naslov: 'Vaučeri', tip: 'broj', sirina: 8 },
      { kljuc: 'naknada', naslov: 'Naknada', tip: 'broj', sirina: 9 },
      { kljuc: 'platitelj', naslov: 'Platitelj', tip: 'tekst', sirina: 12 },
      { kljuc: 'napomena', naslov: 'Napomena', tip: 'tekst', sirina: 40 },
    ],
  },
  ocitanja: {
    sheet: 'Očitanja',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 12 },
      { kljuc: 'datum', naslov: 'Datum', tip: 'datum', sirina: 11 },
      { kljuc: 'vrsta', naslov: 'Vrsta', tip: 'tekst', sirina: 11 },
      { kljuc: 'vrijednost', naslov: 'Stanje / VT', tip: 'broj', sirina: 11 },
      { kljuc: 'nt', naslov: 'NT', tip: 'broj', sirina: 9 },
      { kljuc: 'prijavljeno', naslov: 'Prijavljeno', tip: 'bool', sirina: 10 },
      { kljuc: 'napomena', naslov: 'Napomena', tip: 'tekst', sirina: 40 },
    ],
  },
  cjenici: {
    sheet: 'Cjenici',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 12 },
      { kljuc: 'vrijediOd', naslov: 'Vrijedi od', tip: 'mjesec', sirina: 10 },
      { kljuc: 'stavka', naslov: 'Stavka', tip: 'tekst', sirina: 30 },
      { kljuc: 'osnovica', naslov: 'Osnovica', tip: 'tekst', sirina: 10 },
      { kljuc: 'cijena', naslov: 'Cijena', tip: 'broj', sirina: 12 },
      { kljuc: 'cijenaIznadPraga', naslov: 'Cijena iznad praga', tip: 'broj', sirina: 12 },
      { kljuc: 'uPdv', naslov: 'U PDV', tip: 'bool', sirina: 7 },
      { kljuc: 'zaokruzi', naslov: 'Zaokruži', tip: 'bool', sirina: 8 },
    ],
  },
  vauceri: {
    sheet: 'Vaučeri',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 12 },
      { kljuc: 'vrijediOd', naslov: 'Vrijedi od', tip: 'mjesec', sirina: 10 },
      { kljuc: 'vrijediDo', naslov: 'Vrijedi do', tip: 'mjesec', sirina: 10 },
      { kljuc: 'iznos', naslov: 'Iznos', tip: 'broj', sirina: 8 },
      { kljuc: 'komadaMjesecno', naslov: 'Komada mjesečno', tip: 'broj', sirina: 10 },
    ],
  },
  rasporedi: {
    sheet: 'Rasporedi',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 12 },
      { kljuc: 'prviOdvoz', naslov: 'Prvi odvoz', tip: 'datum', sirina: 11 },
      { kljuc: 'svakihTjedana', naslov: 'Svakih tjedana', tip: 'broj', sirina: 10 },
      { kljuc: 'napomena', naslov: 'Napomena', tip: 'tekst', sirina: 40 },
    ],
  },
  promjeneRata: {
    sheet: 'Promjene rata',
    stupci: [
      { kljuc: 'id', naslov: 'ID', tip: 'tekst', sirina: 10 },
      { kljuc: 'rezijaId', naslov: 'Režija', tip: 'tekst', sirina: 22 },
      { kljuc: 'vrijediOd', naslov: 'Vrijedi od', tip: 'mjesec', sirina: 10 },
      { kljuc: 'iznos', naslov: 'Iznos rate', tip: 'broj', sirina: 11 },
      { kljuc: 'procjena', naslov: 'Procjena', tip: 'bool', sirina: 9 },
      { kljuc: 'napomena', naslov: 'Napomena', tip: 'tekst', sirina: 40 },
    ],
  },
};

const POSTAVKE_SHEET = 'Postavke';

function uCeliju(v: unknown, tip: Tip): XLSX.CellObject | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  switch (tip) {
    case 'broj':
      return { t: 'n', v: v as number };
    case 'datum':
      return { t: 'n', v: datumUExcelSerijski(v as string), z: 'dd.mm.yyyy' };
    case 'bool':
      return { t: 's', v: v ? 'da' : 'ne' };
    default:
      return { t: 's', v: String(v) };
  }
}

function izCelije(c: XLSX.CellObject | undefined, tip: Tip): unknown {
  if (!c || c.v === undefined || c.v === null || c.v === '') return undefined;
  const v = c.v;
  switch (tip) {
    case 'broj': {
      if (typeof v === 'number') return v;
      const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
      return Number.isNaN(n) ? undefined : n;
    }
    case 'datum': {
      if (typeof v === 'number') return excelSerijskiUDatum(v);
      if (v instanceof Date) return excelSerijskiUDatum(datumUExcelSerijski(v.toISOString().slice(0, 10)));
      const s = String(v).trim();
      const hr = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (hr) return `${hr[3]}-${hr[2].padStart(2, '0')}-${hr[1].padStart(2, '0')}`;
      return s.slice(0, 10);
    }
    case 'mjesec': {
      if (typeof v === 'number') return excelSerijskiUDatum(v).slice(0, 7);
      const s = String(v).trim();
      const hr = s.match(/^(\d{1,2})\.\s*(\d{4})/);
      if (hr) return `${hr[2]}-${hr[1].padStart(2, '0')}`;
      return s.slice(0, 7);
    }
    case 'bool':
      return typeof v === 'boolean' ? v : ['da', 'true', '1', 'x', 'yes'].includes(String(v).trim().toLowerCase());
    default:
      return String(v).trim();
  }
}

function tablicaUSheet(redovi: Record<string, unknown>[], stupci: Stupac[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  stupci.forEach((s, c) => (ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: s.naslov }));
  redovi.forEach((red, r) =>
    stupci.forEach((s, c) => {
      const cell = uCeliju(red[s.kljuc], s.tip);
      if (cell) ws[XLSX.utils.encode_cell({ r: r + 1, c })] = cell;
    }),
  );
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(redovi.length, 1), c: stupci.length - 1 } });
  ws['!cols'] = stupci.map((s) => ({ wch: s.sirina ?? 12 }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: redovi.length, c: stupci.length - 1 } }) };
  return ws;
}

function sheetUTablicu(ws: XLSX.WorkSheet | undefined, stupci: Stupac[]): Record<string, unknown>[] {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  // stupce tražimo po naslovu, pa redoslijed u Excelu može biti promijenjen
  const poz = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (h) poz.set(String(h.v).trim().toLowerCase(), c);
  }
  const out: Record<string, unknown>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const red: Record<string, unknown> = {};
    let ima = false;
    for (const s of stupci) {
      const c = poz.get(s.naslov.toLowerCase());
      if (c === undefined) continue;
      const v = izCelije(ws[XLSX.utils.encode_cell({ r, c })], s.tip);
      if (v !== undefined) {
        red[s.kljuc] = v;
        ima = true;
      }
    }
    if (ima) out.push(red);
  }
  return out;
}

const POSTAVKE_OPIS: { kljuc: keyof Postavke; naslov: string }[] = [
  { kljuc: 'strujaPrag', naslov: 'Struja: prag potrošnje (kWh)' },
  { kljuc: 'strujaPragTrajanje', naslov: 'Struja: trajanje razdoblja praga (mjeseci)' },
  { kljuc: 'strujaPragMjeseci', naslov: 'Struja: mjeseci zatvaranja razdoblja' },
  { kljuc: 'platitelji', naslov: 'Platitelji' },
];

export function podaciUWorkbook(p: Podaci): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [k, s] of Object.entries(SHEME)) {
    const redovi = p[k as keyof typeof SHEME] as unknown as Record<string, unknown>[];
    XLSX.utils.book_append_sheet(wb, tablicaUSheet(redovi, s.stupci), s.sheet);
  }
  const post = XLSX.utils.aoa_to_sheet([
    ['Postavka', 'Vrijednost'],
    ...POSTAVKE_OPIS.map((o) => {
      const v = p.postavke[o.kljuc];
      return [o.naslov, Array.isArray(v) ? v.join(o.kljuc === 'platitelji' ? ', ' : ',') : v];
    }),
  ]);
  post['!cols'] = [{ wch: 45 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, post, POSTAVKE_SHEET);
  return wb;
}

export function workbookUPodatke(wb: XLSX.WorkBook): Podaci {
  const t = <T>(k: keyof typeof SHEME) => sheetUTablicu(wb.Sheets[SHEME[k].sheet], SHEME[k].stupci) as T[];
  const postavke: Postavke = { ...ZADANE_POSTAVKE };
  const ws = wb.Sheets[POSTAVKE_SHEET];
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    for (const red of aoa.slice(1)) {
      const o = POSTAVKE_OPIS.find((x) => x.naslov === red[0]);
      if (!o || red[1] === undefined) continue;
      if (o.kljuc === 'platitelji') postavke.platitelji = String(red[1]).split(',').map((x) => x.trim()).filter(Boolean);
      else if (o.kljuc === 'strujaPragMjeseci') postavke.strujaPragMjeseci = String(red[1]).split(/[,;\s]+/).map(Number).filter(Boolean);
      else postavke[o.kljuc] = Number(red[1]);
    }
  }
  const ocitanja = t<Podaci['ocitanja'][number]>('ocitanja').map((o) => ({ ...o, prijavljeno: o.prijavljeno || undefined }));
  const rezije = t<Podaci['rezije'][number]>('rezije').map((r) => ({ ...r, aktivna: r.aktivna ?? true, redoslijed: r.redoslijed ?? 99, grupa: r.grupa ?? 'Ostalo' }));
  const cjenici = t<Podaci['cjenici'][number]>('cjenici').map((c) => ({ ...c, uPdv: c.uPdv ?? false, zaokruzi: c.zaokruzi ?? false }));
  return {
    rezije,
    placanja: t('placanja'),
    ocitanja,
    cjenici,
    vauceri: t('vauceri'),
    promjeneRata: t<Podaci['promjeneRata'][number]>('promjeneRata').map((x) => ({ ...x, procjena: x.procjena || undefined })),
    rasporedi: t<Podaci['rasporedi'][number]>('rasporedi').map((x) => ({ ...x, svakihTjedana: x.svakihTjedana || 1 })),
    postavke,
  };
}

export function citajDatoteku(data: ArrayBuffer): Podaci {
  return workbookUPodatke(XLSX.read(data, { type: 'array' }));
}

export function zapisiDatoteku(p: Podaci): ArrayBuffer {
  return XLSX.write(podaciUWorkbook(p), { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
}
