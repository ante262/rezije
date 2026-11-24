export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Excel ROUND (zaokruživanje od nule) */
export function xround(x: number, d = 0): number {
  const f = 10 ** d;
  const v = Math.abs(x) * f;
  // ispravak za binarne ostatke (npr. 1.005)
  const r = Math.round(v + 1e-9);
  return (Math.sign(x) * r) / f;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const mjesec = (datum: string) => datum.slice(0, 7);
export const godina = (m: string) => Number(m.slice(0, 4));
export const brojMjeseca = (m: string) => Number(m.slice(5, 7));

export function dodajMjesece(m: string, n: number): string {
  const y = godina(m);
  const mm = brojMjeseca(m) - 1 + n;
  const ny = y + Math.floor(mm / 12);
  const nm = ((mm % 12) + 12) % 12;
  return `${ny}-${pad(nm + 1)}`;
}

export function daniUMjesecu(m: string): number {
  return new Date(Date.UTC(godina(m), brojMjeseca(m), 0)).getUTCDate();
}

export function danas(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function rasponMjeseci(od: string, doM: string): string[] {
  const out: string[] = [];
  for (let m = od; m <= doM; m = dodajMjesece(m, 1)) out.push(m);
  return out;
}

/** Datum u istom danu n mjeseci kasnije (dan se skraćuje na kraj mjeseca). */
export function datumPlusMjeseci(datum: string, n: number, dan?: number): string {
  const m = dodajMjesece(mjesec(datum), n);
  const d = Math.min(dan ?? Number(datum.slice(8, 10)), daniUMjesecu(m));
  return `${m}-${pad(d)}`;
}

export function datumUMjesecu(m: string, dan: number): string {
  return `${m}-${pad(Math.min(dan, daniUMjesecu(m)))}`;
}

/** Excel serijski broj -> 'YYYY-MM-DD' */
export function excelSerijskiUDatum(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function datumUExcelSerijski(datum: string): number {
  const [y, m, d] = datum.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
}

const MJESECI = ['siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj', 'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac'];
const MJESECI_KRATKO = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];

export const nazivMjeseca = (m: string) => `${MJESECI[brojMjeseca(m) - 1]} ${godina(m)}.`;
export const kratkiMjesec = (m: string) => `${MJESECI_KRATKO[brojMjeseca(m) - 1]} ${String(godina(m)).slice(2)}`;
export const imeMjeseca = (broj: number) => MJESECI[broj - 1];
export const kratkoImeMjeseca = (broj: number) => MJESECI_KRATKO[broj - 1];

export function prikazDatuma(datum?: string): string {
  if (!datum) return '';
  const [y, m, d] = datum.split('-');
  return `${Number(d)}.${Number(m)}.${y}.`;
}

const fmt = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? '–' : `${fmt.format(x)} €`);
export const broj = (x: number, dec = 0) =>
  new Intl.NumberFormat('hr-HR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(x);

// ---------------------------------------------------------------- dani i blagdani

const uDate = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const izDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function dodajDane(d: string, n: number): string {
  const x = uDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return izDate(x);
}

export function razlikaDana(od: string, doD: string): number {
  return Math.round((uDate(doD).getTime() - uDate(od).getTime()) / 86400000);
}

/** 1 = ponedjeljak … 7 = nedjelja */
export const danUTjednu = (d: string) => ((uDate(d).getUTCDay() + 6) % 7) + 1;

const DANI = ['ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota', 'nedjelja'];
const DANI_INSTR = ['ponedjeljkom', 'utorkom', 'srijedom', 'četvrtkom', 'petkom', 'subotom', 'nedjeljom'];
export const imeDana = (d: string) => DANI[danUTjednu(d) - 1];
/** "srijedom" */
export const danUTjednuInstr = (d: string) => DANI_INSTR[danUTjednu(d) - 1];

/** Uskrs (gregorijanski kalendar). */
function uskrs(g: number): string {
  const a = g % 19, b = Math.floor(g / 100), c = g % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), gg = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - gg + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mj = Math.floor((h + l - 7 * m + 114) / 31), dan = ((h + l - 7 * m + 114) % 31) + 1;
  return `${g}-${pad(mj)}-${pad(dan)}`;
}

const blagdaniCache = new Map<number, Map<string, string>>();

/** Blagdani i neradni dani u Hrvatskoj (Zakon o blagdanima, od 2020.). */
export function blagdani(g: number): Map<string, string> {
  let b = blagdaniCache.get(g);
  if (b) return b;
  const u = uskrs(g);
  b = new Map([
    [`${g}-01-01`, 'Nova godina'],
    [`${g}-01-06`, 'Bogojavljenje'],
    [u, 'Uskrs'],
    [dodajDane(u, 1), 'Uskrsni ponedjeljak'],
    [`${g}-05-01`, 'Praznik rada'],
    [`${g}-05-30`, 'Dan državnosti'],
    [dodajDane(u, 60), 'Tijelovo'],
    [`${g}-06-22`, 'Dan antifašističke borbe'],
    [`${g}-08-05`, 'Dan pobjede i domovinske zahvalnosti'],
    [`${g}-08-15`, 'Velika Gospa'],
    [`${g}-11-01`, 'Svi sveti'],
    [`${g}-11-18`, 'Dan sjećanja na žrtve Domovinskog rata'],
    [`${g}-12-25`, 'Božić'],
    [`${g}-12-26`, 'Sveti Stjepan'],
  ]);
  blagdaniCache.set(g, b);
  return b;
}

export const blagdan = (d: string) => blagdani(Number(d.slice(0, 4))).get(d);
export const radniDan = (d: string) => danUTjednu(d) <= 5 && !blagdan(d);

/** Isti dan ako je radni, inače prvi sljedeći radni dan. */
export function sljedeciRadniDan(d: string): string {
  let x = d;
  while (!radniDan(x)) x = dodajDane(x, 1);
  return x;
}
