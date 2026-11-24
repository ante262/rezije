/**
 * Jednokratni uvoz iz starog Excela (Režije.xlsx) u novi raspored (rezije-podaci.xlsx),
 * s provjerom da novi izračun daje iste iznose kao formule u starom Excelu.
 *
 *   npx tsx scripts/uvoz.ts ../Režije.xlsx ../rezije-podaci.xlsx
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { cjenikZa, obracunaj, serijaBrojila } from '../src/domain/calc';
import { dodajMjesece, excelSerijskiUDatum, mjesec, round2 } from '../src/domain/dates';
import type { Ocitanje, Placanje, Podaci, Rezija, StavkaCjenika, Vaucer } from '../src/domain/types';
import { ZADANE_POSTAVKE } from '../src/domain/types';
import { citajDatoteku, zapisiDatoteku } from '../src/domain/workbook';

const [ulaz, izlaz] = process.argv.slice(2);
if (!ulaz || !izlaz) {
  console.error('upotreba: tsx scripts/uvoz.ts <stari.xlsx> <novi.xlsx>');
  process.exit(1);
}
const wb = XLSX.read(fs.readFileSync(ulaz), { type: 'buffer' });
const KUNA = 7.5345;
const EURO_OD = '2023-01-01';

// ---------------------------------------------------------------- pomoćno

const cell = (sh: string, a: string) => wb.Sheets[sh][a]?.v as string | number | undefined;
const zadnjiRed = (sh: string) => XLSX.utils.decode_range(wb.Sheets[sh]['!ref']!).e.r + 1;

function datum(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return excelSerijskiUDatum(v);
  const m = String(v).trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
}

/** Iznos u eurima: do 2023. su iznosi u kunama. */
const uEur = (x: number, d: string) => (d < EURO_OD ? round2(x / KUNA) : round2(x));

/** Stupac "Mjesec" (B): broj mjeseca, "12.2020.", "12." ili "6-12" -> 'YYYY-MM' */
function zaMjesec(b: unknown, d: string): string | undefined {
  if (b === undefined || b === null || b === '') return undefined;
  const s = String(b);
  const puni = s.match(/^(\d{1,2})\.(\d{4})/);
  if (puni) return `${puni[2]}-${puni[1].padStart(2, '0')}`;
  const brojevi = s.match(/\d+/g);
  if (!brojevi) return undefined;
  const mj = Number(brojevi[brojevi.length - 1]);
  if (mj < 1 || mj > 12) return undefined;
  let god = Number(d.slice(0, 4));
  if (mj > Number(d.slice(5, 7))) god -= 1;
  return `${god}-${String(mj).padStart(2, '0')}`;
}

let pid = 0;
let oid = 0;
let cid = 0;
const novoP = () => `p${String(++pid).padStart(4, '0')}`;
const novoO = () => `o${String(++oid).padStart(4, '0')}`;
const novoC = () => `c${String(++cid).padStart(3, '0')}`;

const placanja: Placanje[] = [];
const ocitanja: Ocitanje[] = [];
const cjenici: StavkaCjenika[] = [];
const upozorenja: string[] = [];

interface Red {
  red: number;
  datum: string;
  datumPopunjen: boolean;
  b: unknown;
  c: number;
  d?: number;
}

/** Redovi plaćanja (A datum, B mjesec, C iznos, D naknada). Datum koji nedostaje = prethodni + 1 mjesec. */
function redoviPlacanja(sh: string, naknadaStupac = 'D'): Red[] {
  const out: Red[] = [];
  let zadnji: string | undefined;
  for (let r = 2; r <= zadnjiRed(sh); r++) {
    const c = cell(sh, `C${r}`);
    let d = datum(cell(sh, `A${r}`));
    if (typeof c !== 'number') {
      if (d) zadnji = d;
      continue;
    }
    let popunjen = false;
    if (!d) {
      if (!zadnji) continue;
      d = `${dodajMjesece(mjesec(zadnji), 1)}-${zadnji.slice(8, 10)}`;
      popunjen = true;
    }
    zadnji = d;
    const n = cell(sh, `${naknadaStupac}${r}`);
    out.push({ red: r, datum: d, datumPopunjen: popunjen, b: cell(sh, `B${r}`), c, d: typeof n === 'number' ? n : undefined });
  }
  return out;
}

function uvezi(sh: string, rezijaId: string, opts: { naknada?: boolean; opisStupac?: string; zaMj?: (r: Red) => string | undefined } = {}) {
  const redovi = redoviPlacanja(sh);
  for (const r of redovi) {
    if (r.c === 0 && !r.d) continue;
    const napomena = [
      opts.opisStupac ? cell(sh, `${opts.opisStupac}${r.red}`) : undefined,
      r.datumPopunjen ? 'datum nadopunjen pri uvozu' : undefined,
    ].filter(Boolean).join('; ') || undefined;
    placanja.push({
      id: novoP(),
      datum: r.datum,
      rezijaId,
      zaMjesec: opts.zaMj ? opts.zaMj(r) : zaMjesec(r.b, r.datum),
      iznos: uEur(r.c, r.datum),
      naknada: opts.naknada === false || r.d === undefined ? undefined : uEur(r.d, r.datum),
      napomena: napomena as string | undefined,
    });
  }
  return redovi;
}

// ---------------------------------------------------------------- režije

const rezije: Rezija[] = [];
let red = 0;
const dodaj = (r: Omit<Rezija, 'redoslijed' | 'aktivna'> & { aktivna?: boolean }) =>
  rezije.push({ aktivna: true, ...r, redoslijed: ++red });

dodaj({ id: 'struja', naziv: 'Struja', vrsta: 'struja', grupa: 'Režije', danPlacanja: 8 });
dodaj({ id: 'voda', naziv: 'Voda', vrsta: 'voda', grupa: 'Režije', danPlacanja: 5 });
dodaj({ id: 'komunalno', naziv: 'Komunalno', vrsta: 'jednostavna', grupa: 'Režije' });
dodaj({ id: 'smece', naziv: 'Smeće', vrsta: 'smece', grupa: 'Režije', danPlacanja: 10 });
dodaj({ id: 'dimnjak', naziv: 'Dimnjak', vrsta: 'jednostavna', grupa: 'Režije' });
dodaj({ id: 'hrt', naziv: 'HRT', vrsta: 'jednostavna', grupa: 'Režije' });
dodaj({ id: 'internet', naziv: 'Internet', vrsta: 'jednostavna', grupa: 'Telekom' });
dodaj({ id: 'mobitel', naziv: 'Mobitel', vrsta: 'jednostavna', grupa: 'Telekom' });
dodaj({ id: 'mobitel-josipa', naziv: 'Mobitel Josipa', vrsta: 'jednostavna', grupa: 'Telekom' });
dodaj({ id: 'hbo', naziv: 'HBO', vrsta: 'jednostavna', grupa: 'Telekom' });
dodaj({ id: 'vrtic', naziv: 'Vrtić', vrsta: 'jednostavna', grupa: 'Obitelj' });
dodaj({ id: 'zdravstveno', naziv: 'Zdravstveno', vrsta: 'jednostavna', grupa: 'Obitelj' });

uvezi('Komunalno', 'komunalno');
uvezi('Dimnjak', 'dimnjak');
uvezi('Hrt', 'hrt');
uvezi('Internet', 'internet', { naknada: false });
uvezi('Mobitel', 'mobitel', { naknada: false });
uvezi('MobitelJosipa', 'mobitel-josipa');
uvezi('HBO', 'hbo', { naknada: false });
uvezi('Vrtić', 'vrtic');
uvezi('Zdravstveno', 'zdravstveno');

// ---------------------------------------------------------------- krediti

for (const [sh, id, naziv] of [
  ['StambeniKredit', 'stambeni-kredit', 'Stambeni kredit'],
  ['NenamijenskiKredit', 'nenamjenski-kredit', 'Nenamjenski kredit'],
] as const) {
  const redovi = uvezi(sh, id, { naknada: false });
  const pl = placanja.filter((p) => p.rezijaId === id);
  const zadnja = pl[pl.length - 1];
  dodaj({
    id, naziv, vrsta: 'kredit', grupa: 'Krediti',
    iznosRate: zadnja.iznos, prvaRata: zadnja.datum, danPlacanja: Number(zadnja.datum.slice(8, 10)),
    napomena: 'Upiši zadnju ratu ili broj preostalih rata (plan kreće od zadnjeg plaćanja iz Excela).',
  });
  void redovi;
}

// ---------------------------------------------------------------- obročno

{
  const sh = 'Obročno';
  const nazivi: [string, string][] = [];
  for (let c = 4; c <= 16; c++) {
    const n = cell(sh, `${XLSX.utils.encode_col(c)}1`);
    if (n) nazivi.push([XLSX.utils.encode_col(c), String(n)]);
  }
  for (const [col, naziv] of nazivi) {
    const id = 'obrok-' + naziv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    const pl: Placanje[] = [];
    for (let r = 2; r <= 78; r++) {
      const v = cell(sh, `${col}${r}`);
      const d = datum(cell(sh, `A${r}`));
      if (typeof v !== 'number' || !d || v === 0) continue;
      pl.push({ id: novoP(), datum: d, rezijaId: id, zaMjesec: zaMjesec(cell(sh, `B${r}`), d), iznos: uEur(v, d) });
    }
    if (!pl.length) continue;
    placanja.push(...pl);
    const iznosi = pl.map((p) => p.iznos);
    const najcesci = iznosi.sort((a, b) => iznosi.filter((x) => x === b).length - iznosi.filter((x) => x === a).length)[0];
    dodaj({
      id, naziv, vrsta: 'obrok', grupa: 'Obroci', aktivna: false,
      iznosRate: najcesci, prvaRata: pl[0].datum, brojRata: pl.length, danPlacanja: Number(pl[0].datum.slice(8, 10)),
    });
  }
}

// ---------------------------------------------------------------- jednokratno

dodaj({ id: 'drva', naziv: 'Drva', vrsta: 'jednokratno', grupa: 'Jednokratno' });
uvezi('Drva', 'drva', { naknada: false, opisStupac: 'D' });

// ---------------------------------------------------------------- voda

{
  const sh = 'Voda';
  uvezi(sh, 'voda', { zaMj: (r) => dodajMjesece(mjesec(r.datum), -1) });
  // potrošnja K2 = 15 -> početno stanje
  const prvo = datum(cell(sh, 'I2'))!;
  ocitanja.push({
    id: novoO(), rezijaId: 'voda', datum: `${dodajMjesece(mjesec(prvo), -1)}${prvo.slice(7)}`, vrsta: 'ocitanje',
    vrijednost: (cell(sh, 'J2') as number) - (cell(sh, 'K2') as number), napomena: 'početno stanje (izračunato iz potrošnje u Excelu)',
  });
  let prev: number | undefined;
  for (let r = 2; r <= zadnjiRed(sh); r++) {
    const d = datum(cell(sh, `I${r}`));
    const v = cell(sh, `J${r}`);
    if (!d || typeof v !== 'number') continue;
    if (prev !== undefined && v < prev) {
      ocitanja.push({ id: novoO(), rezijaId: 'voda', datum: d, vrsta: 'zamjena', vrijednost: prev, napomena: 'zamjena brojila – završno stanje starog' });
    }
    ocitanja.push({ id: novoO(), rezijaId: 'voda', datum: d, vrsta: 'ocitanje', vrijednost: v });
    prev = v;
  }
  const c = (od: string, stavka: string, osnovica: StavkaCjenika['osnovica'], cijena: number, uPdv: boolean) =>
    cjenici.push({ id: novoC(), rezijaId: 'voda', vrijediOd: od, stavka, osnovica, cijena, uPdv, zaokruzi: false });
  const period = (od: string, k: number, fiksno: number[], pdv: [number, number, number], bez: [number, number, number]) => {
    fiksno.forEach((f, i) => c(od, i === 0 ? 'Fiksni dio' : `Fiksni dio ${i + 1}`, 'fiksno', f / k, true));
    c(od, 'Isporuka vode', 'kolicina', pdv[0] / k, true);
    c(od, 'Odvodnja', 'kolicina', pdv[1] / k, true);
    c(od, 'Pročišćavanje', 'kolicina', pdv[2] / k, true);
    c(od, 'Naknada za zaštitu voda', 'kolicina', bez[0] / k, false);
    c(od, 'Naknada za korištenje voda', 'kolicina', bez[1] / k, false);
    c(od, 'Naknada za razvoj', 'kolicina', bez[2] / k, false);
    c(od, 'PDV', 'pdv', 0.13, false);
  };
  // do lipnja 2022. odvodnja i pročišćavanje nisu bili zasebno
  cjenici.push(
    ...[
      ['Fiksni dio', 'fiksno', 10.95, true], ['Isporuka vode', 'kolicina', 4.22, true],
      ['Naknada za zaštitu voda', 'kolicina', 1.35, false], ['Naknada za korištenje voda', 'kolicina', 2.85, false],
      ['Naknada za razvoj', 'kolicina', 2, false],
    ].map(([stavka, osnovica, cijena, uPdv]) => ({
      id: novoC(), rezijaId: 'voda', vrijediOd: '2020-11', stavka: stavka as string,
      osnovica: osnovica as StavkaCjenika['osnovica'], cijena: (cijena as number) / KUNA, uPdv: uPdv as boolean, zaokruzi: false,
    })),
    { id: novoC(), rezijaId: 'voda', vrijediOd: '2020-11', stavka: 'PDV', osnovica: 'pdv', cijena: 0.13, uPdv: false, zaokruzi: false },
  );
  period('2022-06', KUNA, [10.95], [4.22, 2.79, 2.56], [0.41, 2.85, 2]);
  period('2023-01', 1, [1.45], [0.56009, 0.3703, 0.33977], [0.05441635, 0.37826, 0.26545]);
  period('2023-02', 1, [2.77, 1.88], [0.73396, 0.39153, 0.44462], [0.03583516, 0.37826, 0.26545]);
  period('2023-03', 1, [1.45], [0.56009, 0.3703, 0.33977], [0.03583516, 0.37826, 0.26545]);
  period('2024-07', 1, [1.45], [0.56009, 0.3703, 0.33977], [0.026, 0.3, 0.26545]);
}

// ---------------------------------------------------------------- struja

const excelStruja: { mjesec: string; L: number; R: number; S: number }[] = [];
{
  const sh = 'Struja';
  for (let r = 2; r <= zadnjiRed(sh); r++) {
    const d = datum(cell(sh, `A${r}`));
    const c = cell(sh, `C${r}`);
    if (!d || typeof c !== 'number') continue;
    const f = String(cell(sh, `F${r}`) ?? '');
    const vauceri = /2 vau/.test(f) ? 2 : /vau/.test(f) ? 1 : 0;
    const zm = zaMjesec(cell(sh, `B${r}`), d);
    const L = cell(sh, `L${r}`);
    placanja.push({
      id: novoP(), datum: d, rezijaId: 'struja', zaMjesec: zm, iznos: uEur(c, d),
      racun: typeof L === 'number' && r >= 5 ? round2(L) : undefined,
      vauceri: vauceri || undefined,
      naknada: typeof cell(sh, `D${r}`) === 'number' ? uEur(cell(sh, `D${r}`) as number, d) : undefined,
      napomena: (cell(sh, `T${r}`) as string | undefined) && typeof cell(sh, `T${r}`) === 'string' && !String(cell(sh, `T${r}`)).startsWith('Prijenos') && !/^[+-]?\d/.test(String(cell(sh, `T${r}`))) && cell(sh, `T${r}`) !== 'korekcija' ? String(cell(sh, `T${r}`)) : undefined,
    });
  }
  // početno stanje: N5/O5
  ocitanja.push({ id: novoO(), rezijaId: 'struja', datum: '2021-01-31', vrsta: 'ocitanje', vrijednost: cell(sh, 'N5') as number, nt: cell(sh, 'O5') as number, napomena: 'početno stanje (iz Excela)' });
  for (let r = 5; r <= 74; r++) {
    const a = datum(cell(sh, `A${r}`))!;
    const g = cell(sh, `G${r}`) as number;
    const h = cell(sh, `H${r}`) as number;
    let god = Number(a.slice(0, 4));
    if (g > Number(a.slice(5, 7))) god -= 1;
    const m = `${god}-${String(g).padStart(2, '0')}`;
    const d = `${m}-${String(h).padStart(2, '0')}`;
    if (typeof cell(sh, `W${r}`) === 'number' && r === 68) {
      ocitanja.push({ id: novoO(), rezijaId: 'struja', datum: d, vrsta: 'zamjena', vrijednost: cell(sh, `W${r}`) as number, nt: cell(sh, `X${r}`) as number, napomena: 'novo brojilo – završno stanje starog' });
    }
    ocitanja.push({ id: novoO(), rezijaId: 'struja', datum: d, vrsta: 'ocitanje', vrijednost: cell(sh, `I${r}`) as number, nt: cell(sh, `J${r}`) as number });
    const P = wb.Sheets[sh][`P${r}`];
    if (P && !P.f && r > 9) {
      ocitanja.push({ id: novoO(), rezijaId: 'struja', datum: `${m}-${String(new Date(Date.UTC(god, g, 0)).getUTCDate())}`, vrsta: 'korekcija', vrijednost: P.v as number, nt: cell(sh, `Q${r}`) as number, napomena: String(cell(sh, `T${r}`) ?? 'ručna korekcija stanja na kraju mjeseca') });
    }
    excelStruja.push({ mjesec: m, L: cell(sh, `L${r}`) as number, R: cell(sh, `R${r}`) as number, S: cell(sh, `S${r}`) as number });
  }
  // cjenici
  const add = (od: string, stavka: string, osnovica: StavkaCjenika['osnovica'], cijena: number, o: Partial<StavkaCjenika> = {}) =>
    cjenici.push({ id: novoC(), rezijaId: 'struja', vrijediOd: od, stavka, osnovica, cijena, uPdv: true, zaokruzi: true, ...o });
  const stari = (od: string, vt: number, nt: number, fiks: number) => {
    const o = { uPdv: false, zaokruzi: false };
    add(od, 'Električna energija i mreža (VT, s PDV-om)', 'vt', vt / KUNA, o);
    add(od, 'Električna energija i mreža (NT, s PDV-om)', 'nt', nt / KUNA, o);
    add(od, 'Mjesečne naknade (s PDV-om)', 'fiksno', fiks / KUNA, o);
  };
  stari('2021-01', 1.06785, 0.58195, 19.662);
  stari('2022-04', 1.196105, 0.623195, 21.47);
  const novi = (
    od: string,
    vt: [number, number, number, number], nt: [number, number, number, number],
    fiksno: [string, number, boolean][], iznad?: [number, number],
  ) => {
    add(od, 'Distribucija VT', 'vt', vt[0]);
    add(od, 'Prijenos VT', 'vt', vt[1]);
    add(od, 'Električna energija VT', 'vt', vt[2], iznad ? { cijenaIznadPraga: iznad[0] } : {});
    add(od, 'Naknada za OIE VT', 'vt', vt[3]);
    add(od, 'Distribucija NT', 'nt', nt[0]);
    add(od, 'Prijenos NT', 'nt', nt[1]);
    add(od, 'Električna energija NT', 'nt', nt[2], iznad ? { cijenaIznadPraga: iznad[1] } : {});
    add(od, 'Naknada za OIE NT', 'nt', nt[3]);
    for (const [n, v, z] of fiksno) add(od, n, 'fiksno', v, { zaokruzi: z });
    add(od, 'PDV', 'pdv', 0.13, { uPdv: false, zaokruzi: false });
  };
  novi('2022-12', [0.034508, 0.017254, 0.074789, 0.013936], [0.015927, 0.006636, 0.036698, 0.013936], [['Mjerna usluga i opskrbna naknada', 2.52, true]]);
  novi('2023-10', [0.034508, 0.017254, 0.074789, 0.013936], [0.015927, 0.006636, 0.036697, 0.013936], [['Mjerna usluga i opskrbna naknada', 2.522, false]]);
  novi('2024-03', [0.034508, 0.017254, 0.074789, 0.013239], [0.015927, 0.006636, 0.036697, 0.013239], [['Mjerna usluga i opskrbna naknada', 2.522, false]]);
  novi('2024-11', [0.034508, 0.017254, 0.084512, 0.013239], [0.015927, 0.006636, 0.041468, 0.013239], [['Mjerna usluga i opskrbna naknada', 2.522, false]]);
  novi('2025-01', [0.038649, 0.019324, 0.084512, 0.013239], [0.017838, 0.007432, 0.041468, 0.013239], [['Mjerna usluga', 1.724, false], ['Opskrbna naknada', 0.982, false]]);
  novi('2025-05', [0.038649, 0.019324, 0.084512, 0.013239], [0.017838, 0.007432, 0.041468, 0.013239], [['Mjerna usluga', 1.724, true], ['Opskrbna naknada', 0.982, true]]);
  novi('2025-11', [0.038649, 0.019324, 0.097189, 0.013239], [0.017838, 0.007432, 0.047688, 0.013239], [['Mjerna usluga', 1.724, true], ['Opskrbna naknada', 0.982, true]]);
  novi('2026-01', [0.044446, 0.021256, 0.097189, 0.013239], [0.020514, 0.008175, 0.047688, 0.013239], [['Mjerna usluga', 1.983, true], ['Opskrbna naknada', 0.982, true]], [0.131205, 0.064379]);
}

// ---------------------------------------------------------------- smeće

{
  uvezi('Smeće', 'smece');
  const c = (od: string, stavka: string, osnovica: StavkaCjenika['osnovica'], cijena: number, uPdv = true) =>
    cjenici.push({ id: novoC(), rezijaId: 'smece', vrijediOd: od, stavka, osnovica, cijena, uPdv, zaokruzi: false });
  c('2025-05', 'Fiksni dio', 'fiksno', 7.04);
  c('2025-05', 'Odvoz', 'kolicina', 2.2124);
  c('2025-05', 'PDV', 'pdv', 0.13, false);
  c('2026-09', 'Fiksni dio', 'fiksno', 7.04);
  c('2026-09', 'Odvoz', 'kolicina', 4.25);
  c('2026-09', 'PDV', 'pdv', 0.13, false);
  // broj odvoza iz iznosa računa
  for (const p of placanja.filter((x) => x.rezijaId === 'smece' && x.zaMjesec && x.zaMjesec >= '2025-05')) {
    const st = cjenikZa(cjenici, 'smece', p.zaMjesec!);
    const fiks = st.find((s) => s.osnovica === 'fiksno')!.cijena;
    const cij = st.find((s) => s.osnovica === 'kolicina')!.cijena;
    const n = (p.iznos / 1.13 - fiks) / cij;
    const nr = Math.round(n);
    if (nr >= 0 && Math.abs(obracunaj(st, { kolicina: nr }).ukupno - p.iznos) <= 0.011) {
      ocitanja.push({ id: novoO(), rezijaId: 'smece', datum: `${p.zaMjesec}-01`, vrsta: 'odvozi', vrijednost: nr, napomena: 'izračunato iz iznosa računa' });
    } else upozorenja.push(`Smeće ${p.zaMjesec}: iznos ${p.iznos} ne odgovara cijelom broju odvoza (${n.toFixed(2)})`);
  }
}

const vauceri: Vaucer[] = [{ id: 'v1', rezijaId: 'struja', vrijediOd: '2024-10', iznos: 70, komadaMjesecno: 1 }];

// ---------------------------------------------------------------- aktivnost

const SADA = '2026-11';
for (const r of rezije) {
  if (r.vrsta !== 'jednostavna') continue;
  const zadnje = placanja.filter((p) => p.rezijaId === r.id && p.iznos > 0).map((p) => p.datum).sort().pop();
  if (!zadnje || mjesec(zadnje) < dodajMjesece(SADA, -7)) r.aktivna = false;
}

placanja.sort((a, b) => (a.datum === b.datum ? a.id.localeCompare(b.id) : a.datum < b.datum ? -1 : 1));
const podaci: Podaci = { rezije, placanja, ocitanja, cjenici, vauceri, promjeneRata: [], rasporedi: [], postavke: ZADANE_POSTAVKE };
fs.writeFileSync(izlaz, Buffer.from(zapisiDatoteku(podaci)));

// ---------------------------------------------------------------- provjera

const p2 = citajDatoteku(fs.readFileSync(izlaz).buffer as ArrayBuffer);
console.log(`Zapisano: ${izlaz}`);
console.log(`  režija ${p2.rezije.length}, plaćanja ${p2.placanja.length}, očitanja ${p2.ocitanja.length}, stavki cjenika ${p2.cjenici.length}`);
const isti = JSON.stringify(p2.placanja) === JSON.stringify(placanja) && JSON.stringify(p2.ocitanja) === JSON.stringify(ocitanja);
console.log(`  ponovno čitanje datoteke daje iste podatke: ${isti ? 'da' : 'NE'}`);

let greske = 0;
const ser = serijaBrojila(p2, p2.rezije.find((r) => r.id === 'struja')!, { sada: SADA, unaprijed: 0 });
console.log('\nStruja – usporedba s Excelom (mjesec: potrošnja VT/NT, račun):');
for (const e of excelStruja) {
  const s = ser.find((x) => x.mjesec === e.mjesec);
  const okPot = s && s.vt === e.R && s.nt === e.S;
  const L = Math.round(e.L * 100) / 100;
  const okR = s && s.racun !== undefined && Math.abs(s.racun - L) < 0.006;
  if (!okPot || !okR) {
    greske++;
    console.log(`  ✗ ${e.mjesec}: Excel ${e.R}/${e.S} ${L}  app ${s?.vt}/${s?.nt} ${s?.racun}`);
  }
}
console.log(`  ${excelStruja.length - greske}/${excelStruja.length} mjeseci se slaže`);

const vodaSer = serijaBrojila(p2, p2.rezije.find((r) => r.id === 'voda')!, { sada: SADA, unaprijed: 0 });
let vg = 0;
let vu = 0;
console.log('\nVoda – usporedba s Excelom (mjesec očitanja: m³, račun):');
for (let r = 2; r <= zadnjiRed('Voda'); r++) {
  const d = datum(cell('Voda', `I${r}`));
  const L = cell('Voda', `L${r}`);
  if (!d || typeof L !== 'number') continue;
  vu++;
  const s = vodaSer.find((x) => x.mjesec === mjesec(d));
  const ocek = round2(d < EURO_OD ? L / KUNA : L);
  if (!s || s.kolicina !== cell('Voda', `K${r}`) || Math.abs((s.racun ?? -1) - ocek) > 0.011) {
    vg++;
    console.log(`  ✗ ${mjesec(d)}: Excel ${cell('Voda', `K${r}`)} m³ ${ocek}  app ${s?.kolicina} ${s?.racun}`);
  }
}
console.log(`  ${vu - vg}/${vu} očitanja se slaže`);

console.log('\nZbroj plaćanja po listu (Excel, preračunato u €) vs novi podaci:');
const listovi: [string, string][] = [
  ['Voda', 'voda'], ['Struja', 'struja'], ['Komunalno', 'komunalno'], ['Smeće', 'smece'], ['Hrt', 'hrt'], ['Vrtić', 'vrtic'],
  ['Zdravstveno', 'zdravstveno'], ['Internet', 'internet'], ['Mobitel', 'mobitel'], ['MobitelJosipa', 'mobitel-josipa'],
  ['Dimnjak', 'dimnjak'], ['HBO', 'hbo'], ['Drva', 'drva'], ['NenamijenskiKredit', 'nenamjenski-kredit'], ['StambeniKredit', 'stambeni-kredit'],
];
for (const [sh, id] of listovi) {
  const ex = round2(redoviPlacanja(sh).reduce((a, r) => a + uEur(r.c, r.datum), 0));
  const nov = round2(p2.placanja.filter((p) => p.rezijaId === id).reduce((a, p) => a + p.iznos, 0));
  const n = p2.placanja.filter((p) => p.rezijaId === id).length;
  console.log(`  ${ex === nov ? '✓' : '✗'} ${sh.padEnd(20)} ${String(n).padStart(3)} plaćanja  ${ex.toFixed(2).padStart(10)} € / ${nov.toFixed(2).padStart(10)} €`);
}
const obEx = round2(
  Array.from({ length: 77 }, (_, i) => i + 2).reduce((a, r) => {
    const d = datum(cell('Obročno', `A${r}`));
    if (!d) return a;
    let s = 0;
    for (let c = 4; c <= 16; c++) {
      const v = cell('Obročno', `${XLSX.utils.encode_col(c)}${r}`);
      if (typeof v === 'number') s += uEur(v, d);
    }
    return a + s;
  }, 0),
);
const obNov = round2(p2.placanja.filter((p) => p.rezijaId.startsWith('obrok-')).reduce((a, p) => a + p.iznos, 0));
console.log(`  ${obEx === obNov ? '✓' : '✗'} ${'Obročno'.padEnd(20)}       ${obEx.toFixed(2).padStart(10)} € / ${obNov.toFixed(2).padStart(10)} €`);

if (upozorenja.length) console.log('\nUpozorenja:\n  ' + upozorenja.join('\n  '));
