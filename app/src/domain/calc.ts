import {
  blagdan, brojMjeseca, daniUMjesecu, datumPlusMjeseci, datumUMjesecu, dodajDane, dodajMjesece, mjesec, rasponMjeseci, round2,
  sljedeciRadniDan, xround,
} from './dates';
import type { Ocitanje, Placanje, Podaci, PromjenaRate, Raspored, Rezija, StavkaCjenika } from './types';

// ---------------------------------------------------------------- cjenici

/** Stavke cjenika koje vrijede za zadani mjesec potrošnje. */
export function cjenikZa(cjenici: StavkaCjenika[], rezijaId: string, m: string): StavkaCjenika[] {
  const svi = cjenici.filter((c) => c.rezijaId === rezijaId && c.vrijediOd <= m);
  if (!svi.length) return [];
  const od = svi.reduce((a, c) => (c.vrijediOd > a ? c.vrijediOd : a), '');
  return svi.filter((c) => c.vrijediOd === od);
}

export function razdobljaCjenika(cjenici: StavkaCjenika[], rezijaId: string): string[] {
  return [...new Set(cjenici.filter((c) => c.rezijaId === rezijaId).map((c) => c.vrijediOd))].sort();
}

export interface Kolicine {
  vt?: number;
  nt?: number;
  kolicina?: number;
  /** dio VT/NT potrošnje iznad praga */
  vtIznad?: number;
  ntIznad?: number;
}

export interface StavkaObracuna {
  stavka: string;
  iznos: number;
  uPdv: boolean;
}

export interface Obracun {
  stavke: StavkaObracuna[];
  osnovicaPdv: number;
  pdv: number;
  bezPdv: number;
  ukupno: number;
}

export function obracunaj(stavke: StavkaCjenika[], q: Kolicine): Obracun {
  const stopaPdv = stavke.find((s) => s.osnovica === 'pdv')?.cijena ?? 0;
  const out: StavkaObracuna[] = [];
  let osnovicaPdv = 0;
  let bezPdv = 0;
  for (const s of stavke) {
    if (s.osnovica === 'pdv') continue;
    const kol =
      s.osnovica === 'vt' ? q.vt ?? 0 : s.osnovica === 'nt' ? q.nt ?? 0 : s.osnovica === 'kolicina' ? q.kolicina ?? 0 : 1;
    const z = (x: number) => (s.zaokruzi ? xround(x, 2) : x);
    let iznos: number;
    const iznad = s.osnovica === 'vt' ? q.vtIznad ?? 0 : s.osnovica === 'nt' ? q.ntIznad ?? 0 : 0;
    if (s.cijenaIznadPraga !== undefined && iznad > 0) {
      iznos = z((kol - iznad) * s.cijena) + z(iznad * s.cijenaIznadPraga);
    } else {
      iznos = z(kol * s.cijena);
    }
    out.push({ stavka: s.stavka, iznos, uPdv: s.uPdv });
    if (s.uPdv) osnovicaPdv += iznos;
    else bezPdv += iznos;
  }
  const pdv = osnovicaPdv * stopaPdv;
  return { stavke: out, osnovicaPdv, pdv, bezPdv, ukupno: xround(osnovicaPdv + pdv + bezPdv, 2) };
}

const imaPrag = (stavke: StavkaCjenika[]) => stavke.some((s) => s.cijenaIznadPraga !== undefined);

// ---------------------------------------------------------------- vaučeri

export function vauceriZa(p: Podaci, rezijaId: string, mjesecPlacanja: string): { komada: number; iznos: number } {
  const v = p.vauceri.find(
    (x) => x.rezijaId === rezijaId && x.vrijediOd <= mjesecPlacanja && (!x.vrijediDo || x.vrijediDo >= mjesecPlacanja),
  );
  return v ? { komada: v.komadaMjesecno, iznos: v.iznos } : { komada: 0, iznos: 0 };
}

// ---------------------------------------------------------------- brojila

export type Izvor = 'ocitanje' | 'procjena' | 'rucna-procjena' | 'nema';

export interface MjesecPotrosnje {
  /** mjesec potrošnje */
  mjesec: string;
  izvor: Izvor;
  ocitanje?: Ocitanje;
  /** stanje (virtualno, uključujući zamjene brojila) na kraju mjeseca */
  krajVt?: number;
  krajNt?: number;
  vt: number;
  nt: number;
  /** za brojila s jednom tarifom / odvoze */
  kolicina: number;
  /** smeće: broj već upisanih odvoza u mjesecu koji još traje (kolicina je tada procjena za cijeli mjesec) */
  doSada?: number;
  prag?: { od: string; do: string; ukupno: number; visak: number; visakVt: number; visakNt: number };
  obracun?: Obracun;
  racun?: number;
  vauceri: number;
  zaPlatiti?: number;
  placanje?: Placanje;
}

function sortOcitanja(o: Ocitanje[]): Ocitanje[] {
  const red = { zamjena: 0, korekcija: 2, ocitanje: 1, odvozi: 3, odvoz: 3, procjena: 4 } as const;
  return [...o].sort((a, b) => (a.datum === b.datum ? red[a.vrsta] - red[b.vrsta] : a.datum < b.datum ? -1 : 1));
}

function danIzmedju(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000;
}

const krajMjeseca = (m: string) => datumUMjesecu(m, 31);

interface Kraj {
  m: string;
  vt: number;
  nt: number;
}

/**
 * Struja: iz očitanja izračunaj potrošnju po mjesecima.
 * Očitanje u danu d se linearno produži do kraja mjeseca:
 *   kraj = prošliKraj + (stanje − prošliKraj) · dana_do_kraja / dana_do_očitanja
 * (za uzastopne mjesece to je Excel formula (Dim·I − (Dim−d)·N)/d).
 */
function potrosnjaStruje(ocitanja: Ocitanje[]): { mjeseci: Map<string, MjesecPotrosnje>; zadnji?: Kraj } {
  const mjeseci = new Map<string, MjesecPotrosnje>();
  let offVt = 0;
  let offNt = 0;
  let prev: Kraj | undefined;

  // zadnje očitanje i korekcija po mjesecu (uz pomak zbog zamjene brojila)
  const poMjesecu = new Map<string, { o?: Ocitanje; vt?: number; nt?: number; kor?: { vt: number; nt: number } }>();
  for (const o of sortOcitanja(ocitanja)) {
    const m = mjesec(o.datum);
    const e = poMjesecu.get(m) ?? {};
    if (o.vrsta === 'zamjena') {
      offVt += o.vrijednost;
      offNt += o.nt ?? 0;
      continue;
    }
    if (o.vrsta === 'ocitanje') {
      e.o = o;
      e.vt = o.vrijednost + offVt;
      e.nt = (o.nt ?? 0) + offNt;
    } else if (o.vrsta === 'korekcija') {
      e.kor = { vt: o.vrijednost + offVt, nt: (o.nt ?? 0) + offNt };
    } else continue;
    poMjesecu.set(m, e);
  }

  for (const m of [...poMjesecu.keys()].sort()) {
    const e = poMjesecu.get(m)!;
    if (e.vt === undefined && !e.kor) continue;
    let kraj: Kraj;
    if (e.kor) kraj = { m, ...e.kor };
    else if (!prev) kraj = { m, vt: e.vt!, nt: e.nt! };
    else {
      const k = danIzmedju(krajMjeseca(prev.m), krajMjeseca(m));
      const d = danIzmedju(krajMjeseca(prev.m), e.o!.datum);
      const f = d > 0 ? k / d : 1;
      kraj = { m, vt: prev.vt + (e.vt! - prev.vt) * f, nt: prev.nt + (e.nt! - prev.nt) * f };
    }
    if (prev) {
      // raspodijeli na mjesece (više njih ako je očitanje preskočeno)
      const raspon = rasponMjeseci(dodajMjesece(prev.m, 1), m);
      const ukDana = danIzmedju(krajMjeseca(prev.m), krajMjeseca(m));
      let ostVt = xround(kraj.vt - prev.vt);
      let ostNt = xround(kraj.nt - prev.nt);
      raspon.forEach((rm, i) => {
        const zadnji = i === raspon.length - 1;
        const udio = daniUMjesecu(rm) / ukDana;
        const vt = zadnji ? ostVt : xround((kraj.vt - prev!.vt) * udio);
        const nt = zadnji ? ostNt : xround((kraj.nt - prev!.nt) * udio);
        ostVt -= zadnji ? 0 : vt;
        ostNt -= zadnji ? 0 : nt;
        mjeseci.set(rm, {
          mjesec: rm,
          izvor: 'ocitanje',
          ocitanje: zadnji ? e.o : undefined,
          krajVt: zadnji ? kraj.vt : undefined,
          krajNt: zadnji ? kraj.nt : undefined,
          vt,
          nt,
          kolicina: vt + nt,
          vauceri: 0,
        });
      });
    }
    prev = kraj;
  }
  return { mjeseci, zadnji: prev };
}

/** Brojilo s jednim stanjem (voda, plin): potrošnja = razlika očitanja; mjesec = mjesec očitanja. */
function potrosnjaBrojila(ocitanja: Ocitanje[]): Map<string, MjesecPotrosnje> {
  const mjeseci = new Map<string, MjesecPotrosnje>();
  let off = 0;
  let prev: number | undefined;
  for (const o of sortOcitanja(ocitanja)) {
    if (o.vrsta === 'zamjena') {
      off += o.vrijednost;
      continue;
    }
    if (o.vrsta !== 'ocitanje') continue;
    const v = o.vrijednost + off;
    if (prev !== undefined) {
      const m = mjesec(o.datum);
      const kol = round2(v - prev) + (mjeseci.get(m)?.kolicina ?? 0);
      mjeseci.set(m, { mjesec: m, izvor: 'ocitanje', ocitanje: o, krajVt: v, vt: 0, nt: 0, kolicina: kol, vauceri: 0 });
    }
    prev = v;
  }
  return mjeseci;
}

/** Smeće: broj odvoza po mjesecu (zbroj pojedinačnih odvoza i starih mjesečnih unosa). */
function odvozi(ocitanja: Ocitanje[]): Map<string, MjesecPotrosnje> {
  const mjeseci = new Map<string, MjesecPotrosnje>();
  for (const o of sortOcitanja(ocitanja)) {
    if (o.vrsta !== 'odvozi' && o.vrsta !== 'odvoz') continue;
    const m = mjesec(o.datum);
    const kol = (mjeseci.get(m)?.kolicina ?? 0) + (o.vrsta === 'odvoz' ? 1 : o.vrijednost);
    mjeseci.set(m, { mjesec: m, izvor: 'ocitanje', ocitanje: o, vt: 0, nt: 0, kolicina: kol, vauceri: 0 });
  }
  return mjeseci;
}

// ---------------------------------------------------------------- raspored odvoza

export interface PlaniraniOdvoz {
  /** po rasporedu */
  planirano: string;
  /** stvarni dan (pomaknut na sljedeći radni dan ako je planirani neradni) */
  datum: string;
  /** razlog pomaka (blagdan ili vikend) */
  pomak?: string;
}

export const rasporediZa = (p: Podaci, rezijaId: string): Raspored[] =>
  p.rasporedi.filter((x) => x.rezijaId === rezijaId).sort((a, b) => (a.prviOdvoz < b.prviOdvoz ? -1 : 1));

/** Planirani odvozi između datuma (uključivo), po rasporedima koji tada vrijede. */
export function planiraniOdvozi(p: Podaci, rezijaId: string, od: string, doD: string): PlaniraniOdvoz[] {
  const rs = rasporediZa(p, rezijaId);
  const out: PlaniraniOdvoz[] = [];
  rs.forEach((r, i) => {
    const kraj = rs[i + 1]?.prviOdvoz;
    const korak = 7 * Math.max(1, r.svakihTjedana || 1);
    for (let d = r.prviOdvoz; (!kraj || d < kraj) && d <= doD; d = dodajDane(d, korak)) {
      const stvarni = sljedeciRadniDan(d);
      if (stvarni < od || stvarni > doD) continue;
      out.push({ planirano: d, datum: stvarni, pomak: stvarni !== d ? blagdan(d) ?? 'vikend' : undefined });
    }
  });
  return out;
}

/** Sljedeći odvoz od danas (uključivo), preskačući one koji su već upisani. */
export function sljedeciOdvoz(p: Podaci, rezijaId: string, danasD: string): PlaniraniOdvoz | undefined {
  const upisani = new Set(p.ocitanja.filter((x) => x.rezijaId === rezijaId && x.vrsta === 'odvoz').map((x) => x.datum));
  return planiraniOdvozi(p, rezijaId, danasD, dodajDane(danasD, 70)).find((x) => !upisani.has(x.datum));
}

/** Zadnji planirani odvoz do danas koji još nije upisan (prijedlog za "Dodaj odvoz"). */
export function propusteniOdvoz(p: Podaci, rezijaId: string, danasD: string): PlaniraniOdvoz | undefined {
  const upisani = new Set(p.ocitanja.filter((x) => x.rezijaId === rezijaId && x.vrsta === 'odvoz').map((x) => x.datum));
  return planiraniOdvozi(p, rezijaId, dodajDane(danasD, -13), danasD).filter((x) => !upisani.has(x.datum)).pop();
}

// ---------------------------------------------------------------- rok očitanja i prijava

export type Rok = { tip: 'raspon'; od: number; do: number } | { tip: 'zadnjih'; dana: number };

/** Rok očitanja iz teksta ("15-25", "zadnjih 7", "ne"); prazno = zadano (struja: zadnjih 7 dana, voda: 15.–25.). */
export function rokOcitanja(r: Rezija): Rok | undefined {
  const t = (r.rokOcitanja ?? '').trim().toLowerCase();
  if (!t) return r.vrsta === 'struja' ? { tip: 'zadnjih', dana: 7 } : r.vrsta === 'voda' ? { tip: 'raspon', od: 15, do: 25 } : undefined;
  const z = t.match(/zadnj\D*(\d+)/);
  if (z) return { tip: 'zadnjih', dana: Number(z[1]) };
  const rr = t.match(/(\d+)\D+(\d+)/);
  if (rr) return { tip: 'raspon', od: Number(rr[1]), do: Number(rr[2]) };
  return undefined;
}

export const rokUTekst = (k: Rok | undefined) => (!k ? 'ne' : k.tip === 'zadnjih' ? `zadnjih ${k.dana}` : `${k.od}-${k.do}`);

/** Datumi roka u mjesecu. */
export function prozorOcitanja(k: Rok, m: string): { od: string; do: string } {
  const n = daniUMjesecu(m);
  return k.tip === 'zadnjih'
    ? { od: datumUMjesecu(m, Math.max(1, n - k.dana + 1)), do: datumUMjesecu(m, n) }
    : { od: datumUMjesecu(m, k.od), do: datumUMjesecu(m, k.do) };
}

export const prijavaZa = (r: Rezija) => r.prijavaKome || (r.vrsta === 'struja' ? 'HEP' : r.vrsta === 'voda' ? 'vodovod' : 'distributer');

export interface Podsjetnik {
  rezija: Rezija;
  vrsta: 'unesi' | 'prijavi';
  /** rok je prošao */
  kasni: boolean;
  od: string;
  do: string;
  ocitanje?: Ocitanje;
}

/** Podsjetnici za tekući mjesec: očitanje u roku nije uneseno ili nije prijavljeno. */
export function podsjetnici(p: Podaci, danasD: string): Podsjetnik[] {
  const out: Podsjetnik[] = [];
  const m = mjesec(danasD);
  for (const r of p.rezije) {
    if (!r.aktivna || (r.vrsta !== 'struja' && r.vrsta !== 'voda')) continue;
    const k = rokOcitanja(r);
    if (!k) continue;
    const w = prozorOcitanja(k, m);
    if (danasD < w.od) continue;
    const o = p.ocitanja
      .filter((x) => x.rezijaId === r.id && x.vrsta === 'ocitanje' && x.datum >= w.od && x.datum <= w.do)
      .sort((a, b) => (a.datum < b.datum ? -1 : 1))
      .pop();
    const kasni = danasD > w.do;
    if (!o) out.push({ rezija: r, vrsta: 'unesi', kasni, ...w });
    else if (!o.prijavljeno) out.push({ rezija: r, vrsta: 'prijavi', kasni, ...w, ocitanje: o });
  }
  return out;
}

export interface Opcije {
  /** trenutni mjesec (za procjene) */
  sada: string;
  /** koliko mjeseci unaprijed procijeniti */
  unaprijed?: number;
}

/**
 * Potrošnja, obračun i plaćanje po mjesecima potrošnje za režiju s brojilom (struja, voda, smeće).
 * Mjeseci bez očitanja nakon zadnjeg očitanja procjenjuju se iz istog mjeseca prošle godine
 * (ili ručne procjene).
 */
export function serijaBrojila(p: Podaci, r: Rezija, o: Opcije): MjesecPotrosnje[] {
  const oc = p.ocitanja.filter((x) => x.rezijaId === r.id);
  let mjeseci: Map<string, MjesecPotrosnje>;
  if (r.vrsta === 'struja') mjeseci = potrosnjaStruje(oc).mjeseci;
  else if (r.vrsta === 'smece') mjeseci = odvozi(oc);
  else mjeseci = potrosnjaBrojila(oc);

  const placanja = p.placanja.filter((x) => x.rezijaId === r.id && x.zaMjesec);
  const placanjaPoMj = new Map(placanja.map((x) => [x.zaMjesec!, x]));

  const poznati = [...mjeseci.keys()].sort();
  const prvi = [poznati[0], placanja.map((x) => x.zaMjesec!).sort()[0]].filter(Boolean).sort()[0];
  if (!prvi) return [];
  const zadnjiPoznati = poznati[poznati.length - 1] ?? dodajMjesece(o.sada, -1);
  const kraj = dodajMjesece(o.sada, o.unaprijed ?? 6);
  const rucne = new Map(oc.filter((x) => x.vrsta === 'procjena').map((x) => [mjesec(x.datum), x]));

  const out: MjesecPotrosnje[] = [];
  const poMj = new Map<string, MjesecPotrosnje>();
  const imaRaspored = r.vrsta === 'smece' && p.rasporedi.some((x) => x.rezijaId === r.id);
  for (const m of rasponMjeseci(prvi, kraj)) {
    let e = mjeseci.get(m);
    // smeće s rasporedom: tekući i budući mjeseci = planirani odvozi (ili više ako je upisano više)
    if (imaRaspored && m >= o.sada && !rucne.has(m)) {
      const planirano = planiraniOdvozi(p, r.id, `${m}-01`, krajMjeseca(m)).length;
      const doSada = e?.kolicina ?? 0;
      if (planirano > doSada)
        e = { mjesec: m, izvor: 'procjena', ocitanje: e?.ocitanje, vt: 0, nt: 0, kolicina: planirano, doSada: m === o.sada ? doSada : undefined, vauceri: 0 };
      else if (e && m === o.sada) e = { ...e, doSada };
    }
    if (!e && m > zadnjiPoznati) {
      const rucna = rucne.get(m);
      if (rucna) {
        e = {
          mjesec: m, izvor: 'rucna-procjena', ocitanje: rucna,
          vt: rucna.vrijednost, nt: rucna.nt ?? 0,
          kolicina: r.vrsta === 'struja' ? rucna.vrijednost + (rucna.nt ?? 0) : rucna.vrijednost, vauceri: 0,
        };
      } else {
        const e12 = poMj.get(dodajMjesece(m, -12));
        const izvorni = e12 && e12.izvor !== 'nema' ? e12 : undefined;
        const zadnjih = out.filter((x) => x.izvor === 'ocitanje').slice(-12);
        const prosjek = (f: (x: MjesecPotrosnje) => number) =>
          zadnjih.length ? Math.round(zadnjih.reduce((a, x) => a + f(x), 0) / zadnjih.length) : 0;
        const vt = izvorni ? izvorni.vt : prosjek((x) => x.vt);
        const nt = izvorni ? izvorni.nt : prosjek((x) => x.nt);
        const kol = izvorni ? izvorni.kolicina : prosjek((x) => x.kolicina);
        e = { mjesec: m, izvor: 'procjena', vt, nt, kolicina: r.vrsta === 'struja' ? vt + nt : kol, vauceri: 0 };
      }
    }
    if (!e) e = { mjesec: m, izvor: 'nema', vt: 0, nt: 0, kolicina: 0, vauceri: 0 };
    out.push(e);
    poMj.set(m, e);
  }

  // obračun
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    e.placanje = placanjaPoMj.get(e.mjesec);
    const stavke = cjenikZa(p.cjenici, r.id, e.mjesec);
    if (r.vrsta === 'struja' && e.izvor !== 'nema') {
      const { strujaPrag, strujaPragMjeseci, strujaPragTrajanje } = p.postavke;
      if (strujaPragMjeseci.includes(brojMjeseca(e.mjesec)) && i >= strujaPragTrajanje - 1) {
        const prozor = out.slice(i - strujaPragTrajanje + 1, i + 1);
        const ukupno = prozor.reduce((a, x) => a + x.vt + x.nt, 0);
        const visak = Math.max(0, ukupno - strujaPrag);
        const visakNt = visak > 0 && e.nt > 0 ? xround(visak / (e.vt / e.nt + 1)) : 0;
        e.prag = { od: prozor[0].mjesec, do: e.mjesec, ukupno, visak, visakVt: visak - visakNt, visakNt };
      }
    }
    if (stavke.length && e.izvor !== 'nema') {
      const iznad = e.prag && imaPrag(stavke) ? { vtIznad: e.prag.visakVt, ntIznad: e.prag.visakNt } : {};
      e.obracun = obracunaj(stavke, { vt: e.vt, nt: e.nt, kolicina: e.kolicina, ...iznad });
      e.racun = e.obracun.ukupno;
    }
    const mjPl = dodajMjesece(e.mjesec, 1);
    if (e.placanje) {
      e.vauceri = e.placanje.vauceri ?? 0;
      e.zaPlatiti = e.placanje.iznos;
    } else if (e.racun !== undefined) {
      const v = vauceriZa(p, r.id, mjPl);
      e.vauceri = v.komada;
      e.zaPlatiti = round2(Math.max(0, e.racun - v.komada * v.iznos));
    }
  }
  return out;
}

/** Trenutno razdoblje praga (struja) i potrošnja u njemu. */
export function trenutniPrag(p: Podaci, serija: MjesecPotrosnje[], m: string) {
  const { strujaPragMjeseci, strujaPragTrajanje, strujaPrag } = p.postavke;
  let doM = m;
  for (let i = 0; i < 12 && !strujaPragMjeseci.includes(brojMjeseca(doM)); i++) doM = dodajMjesece(doM, 1);
  const od = dodajMjesece(doM, -(strujaPragTrajanje - 1));
  const mjeseci = serija.filter((x) => x.mjesec >= od && x.mjesec <= doM);
  const stvarno = mjeseci.filter((x) => x.izvor === 'ocitanje').reduce((a, x) => a + x.vt + x.nt, 0);
  const procjena = mjeseci.reduce((a, x) => a + x.vt + x.nt, 0);
  return { od, do: doM, prag: strujaPrag, stvarno, procjena, mjeseci };
}

// ---------------------------------------------------------------- obroci / krediti

export interface Rata {
  datum: string;
  mjesec: string;
  iznos: number;
  redniBroj: number;
  /** iznos rate je procjena (promjena rate označena kao procjena) */
  procjena?: boolean;
  /** od ove rate vrijedi novi iznos */
  promjena?: PromjenaRate;
}

const promjeneZa = (promjene: PromjenaRate[], r: Rezija) =>
  promjene.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.vrijediOd < b.vrijediOd ? -1 : 1));

/** Iznos rate koji vrijedi u mjesecu M (osnovni iznos ili zadnja promjena do tog mjeseca). */
export function rataZa(promjene: PromjenaRate[], r: Rezija, M: string): { iznos: number; procjena?: boolean; promjena?: PromjenaRate } {
  const pr = promjeneZa(promjene, r).filter((x) => x.vrijediOd <= M).pop();
  return pr ? { iznos: pr.iznos, procjena: pr.procjena, promjena: pr } : { iznos: r.iznosRate ?? 0 };
}

export function planOtplate(r: Rezija, promjene: PromjenaRate[] = []): Rata[] {
  if (!r.prvaRata || !r.iznosRate) return [];
  const dan = r.danPlacanja ?? Number(r.prvaRata.slice(8, 10));
  // bez broja rata i zadnje rate plan je otvoren (npr. kredit kojem nije upisan kraj)
  const n =
    r.brojRata ??
    (r.zadnjaRata
      ? (Number(r.zadnjaRata.slice(0, 4)) - Number(r.prvaRata.slice(0, 4))) * 12 +
        (brojMjeseca(mjesec(r.zadnjaRata)) - brojMjeseca(mjesec(r.prvaRata))) + 1
      : 12 * 40);
  const pr = promjeneZa(promjene, r);
  const out: Rata[] = [];
  let k = -1;
  for (let i = 0; i < n; i++) {
    const datum = i === 0 ? r.prvaRata : datumPlusMjeseci(r.prvaRata, i, dan);
    const m = mjesec(datum);
    const prije = k;
    while (k + 1 < pr.length && pr[k + 1].vrijediOd <= m) k++;
    const p = k >= 0 ? pr[k] : undefined;
    out.push({ datum, mjesec: m, iznos: p ? p.iznos : r.iznosRate, redniBroj: i + 1, procjena: p?.procjena || undefined, promjena: k !== prije && i > 0 ? p : undefined });
  }
  return out;
}

export const otvorenPlan = (r: Rezija) => !r.brojRata && !r.zadnjaRata;

export function stanjeOtplate(p: Podaci, r: Rezija, sada: string) {
  const plan = planOtplate(r, p.promjeneRata);
  const placeno = p.placanja.filter((x) => x.rezijaId === r.id);
  const ukupnoPlaceno = placeno.reduce((a, x) => a + x.iznos, 0);
  const preostale = plan.filter((x) => x.mjesec > sada || (x.mjesec === sada && !placeno.some((y) => mjesec(y.datum) === sada)));
  return {
    plan,
    placeno: ukupnoPlaceno,
    preostaloRata: preostale.length,
    preostaloIznos: round2(preostale.reduce((a, x) => a + x.iznos, 0)),
    zavrsava: plan.length && !otvorenPlan(r) ? plan[plan.length - 1].mjesec : undefined,
    placenoRata: plan.length - preostale.length,
  };
}

// ---------------------------------------------------------------- mjesečni pregled

export type Status = 'placeno' | 'ocekivano' | 'automatski';

export interface StavkaMjeseca {
  rezija: Rezija;
  status: Status;
  iznos: number;
  naknada: number;
  placanja: Placanje[];
  napomena?: string;
}

export interface Mjesec {
  mjesec: string;
  stavke: StavkaMjeseca[];
  placeno: number;
  ocekivano: number;
  ukupno: number;
}

export const broji = (r: Rezija) => r.vrsta !== 'jednokratno';

function zadnjaNaknada(p: Podaci, r: Rezija): number {
  const pl = p.placanja.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.datum < b.datum ? -1 : 1));
  return pl.length ? pl[pl.length - 1].naknada ?? 0 : 0;
}

/** Očekivani iznos (bez naknade) koji se plaća u mjesecu M za režiju. */
export function ocekivano(p: Podaci, r: Rezija, M: string, sada: string, serije: Map<string, MjesecPotrosnje[]>): { iznos: number; napomena?: string } | undefined {
  if (!r.aktivna) return undefined;
  switch (r.vrsta) {
    case 'struja':
    case 'voda':
    case 'smece': {
      const e = serije.get(r.id)?.find((x) => x.mjesec === dodajMjesece(M, -1));
      if (!e || e.zaPlatiti === undefined) {
        // nema cjenika – zadnji plaćeni iznos
        const z = p.placanja.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.datum < b.datum ? -1 : 1)).pop();
        return z ? { iznos: z.iznos, napomena: 'kao zadnji račun' } : undefined;
      }
      const opis =
        e.izvor === 'ocitanje' ? 'prema očitanju' : e.izvor === 'rucna-procjena' ? 'ručna procjena' : 'procjena (isti mjesec prošle godine)';
      return { iznos: e.zaPlatiti, napomena: opis };
    }
    case 'obrok':
    case 'kredit': {
      const plan = planOtplate(r, p.promjeneRata);
      const rate = plan.filter((x) => x.mjesec === M);
      if (!rate.length) return undefined;
      const napomena = (otvorenPlan(r) ? `rata ${rate[0].redniBroj}` : `rata ${rate[0].redniBroj}/${plan.length}`) + (rate.some((x) => x.procjena) ? ' · procjena iznosa' : '');
      return { iznos: round2(rate.reduce((a, x) => a + x.iznos, 0)), napomena };
    }
    case 'jednostavna': {
      const pl = p.placanja.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.datum < b.datum ? -1 : 1));
      if (!pl.length) return undefined;
      const ref = M < sada ? M : sada;
      const prosli = [1, 2, 3].map((k) => dodajMjesece(ref, -k));
      const mjesecno = prosli.filter((m) => pl.some((x) => mjesec(x.datum) === m)).length >= 2;
      if (mjesecno) return { iznos: pl[pl.length - 1].iznos, napomena: 'kao zadnji račun' };
      const prosleGodine = pl.filter((x) => mjesec(x.datum) === dodajMjesece(M, -12));
      if (prosleGodine.length)
        return { iznos: round2(prosleGodine.reduce((a, x) => a + x.iznos, 0)), napomena: 'kao prošle godine' };
      return undefined;
    }
    default:
      return undefined;
  }
}

export function sveSerije(p: Podaci, sada: string, unaprijed = 6): Map<string, MjesecPotrosnje[]> {
  const m = new Map<string, MjesecPotrosnje[]>();
  for (const r of p.rezije)
    if (r.vrsta === 'struja' || r.vrsta === 'voda' || r.vrsta === 'smece') m.set(r.id, serijaBrojila(p, r, { sada, unaprijed }));
  return m;
}

/**
 * Pregled mjeseca M (po mjesecu plaćanja).
 * Prošli mjeseci: plaćeno. Tekući i budući: plaćeno + očekivano za ono što još nije plaćeno.
 * Rate obroka/kredita nakon zadnjeg zapisanog plaćanja računaju se automatski.
 */
export function pregledMjeseca(p: Podaci, M: string, sada: string, serije: Map<string, MjesecPotrosnje[]>): Mjesec {
  const stavke: StavkaMjeseca[] = [];
  for (const r of p.rezije) {
    if (!broji(r)) continue;
    const pl = p.placanja.filter((x) => x.rezijaId === r.id && mjesec(x.datum) === M);
    if (pl.length) {
      stavke.push({
        rezija: r, status: 'placeno', placanja: pl,
        iznos: round2(pl.reduce((a, x) => a + x.iznos, 0)),
        naknada: round2(pl.reduce((a, x) => a + (x.naknada ?? 0), 0)),
      });
      continue;
    }
    const sve = p.placanja.filter((x) => x.rezijaId === r.id);
    const zadnje = sve.reduce((a, x) => (x.datum > a ? x.datum : a), '');
    if (r.vrsta === 'obrok' || r.vrsta === 'kredit') {
      if (M <= mjesec(zadnje)) continue;
      const o = ocekivano(p, r, M, sada, serije);
      if (o) stavke.push({ rezija: r, status: M < sada ? 'automatski' : 'ocekivano', iznos: o.iznos, naknada: 0, placanja: [], napomena: o.napomena });
      continue;
    }
    if (M < sada) continue;
    const o = ocekivano(p, r, M, sada, serije);
    if (o && o.iznos >= 0) stavke.push({ rezija: r, status: 'ocekivano', iznos: o.iznos, naknada: zadnjaNaknada(p, r), placanja: [], napomena: o.napomena });
  }
  stavke.sort((a, b) => a.rezija.redoslijed - b.rezija.redoslijed);
  return zbrojStavki(stavke, M);
}

// ---------------------------------------------------------------- platitelji

/** null = svi, inače ime platitelja */
export type FilterPlatitelja = string | null;

/** Zadani platitelj (korisnik aplikacije) je prvi na popisu: njemu idu plaćanja bez upisanog platitelja. */
export const zadaniPlatitelj = (p: Podaci): string => p.postavke.platitelji[0] || ZADANO_IME;
export const ZADANO_IME = 'Ja';

/** Platitelji se prikazuju tek kad uz zadanog postoji još netko. */
export const imaPlatitelje = (p: Podaci) => p.postavke.platitelji.length > 1;

/** Tko je platio: upisano na plaćanju, inače zadani platitelj (oznaka na režiji ne mijenja stara plaćanja). */
export const platiteljPlacanja = (pl: Placanje, zadani: string): string => pl.platitelj || zadani;

/** Tko će platiti očekivani iznos: platitelj s režije, inače zadani. */
export const platiteljRezije = (r: Rezija, zadani: string): string => r.platitelj || zadani;

function zbrojStavki(stavke: StavkaMjeseca[], M: string): Mjesec {
  const placeno = round2(stavke.filter((s) => s.status !== 'ocekivano').reduce((a, s) => a + s.iznos + s.naknada, 0));
  const ocek = round2(stavke.filter((s) => s.status === 'ocekivano').reduce((a, s) => a + s.iznos + s.naknada, 0));
  return { mjesec: M, stavke, placeno, ocekivano: ocek, ukupno: round2(placeno + ocek) };
}

/** Dio mjeseca koji pripada platitelju. Plaćanja po stvarnom platitelju, očekivano po platitelju s režije. */
export function filtrirajMjesec(m: Mjesec, f: FilterPlatitelja, zadani: string): Mjesec {
  if (f === null) return m;
  const stavke: StavkaMjeseca[] = [];
  for (const s of m.stavke) {
    if (s.status === 'placeno') {
      const pl = s.placanja.filter((x) => platiteljPlacanja(x, zadani) === f);
      if (!pl.length) continue;
      stavke.push({
        ...s, placanja: pl,
        iznos: round2(pl.reduce((a, x) => a + x.iznos, 0)),
        naknada: round2(pl.reduce((a, x) => a + (x.naknada ?? 0), 0)),
      });
    } else if (platiteljRezije(s.rezija, zadani) === f) stavke.push(s);
  }
  return zbrojStavki(stavke, m.mjesec);
}

/** Zbroj mjeseca po platiteljima (prvi na popisu je zadani). */
export function poPlatiteljima(m: Mjesec, platitelji: string[]): { platitelj: string; mjesec: Mjesec }[] {
  const zadani = platitelji[0] ?? '';
  const imena = [...platitelji];
  // platitelji upisani u podacima koji više nisu na popisu
  for (const s of m.stavke) for (const x of platiteljiStavke(s, zadani)) if (!imena.includes(x)) imena.push(x);
  return imena.map((x) => ({ platitelj: x, mjesec: filtrirajMjesec(m, x, zadani) }));
}

/** Platitelji stavke za prikaz. */
export function platiteljiStavke(s: StavkaMjeseca, zadani: string): string[] {
  if (s.status !== 'placeno') return [platiteljRezije(s.rezija, zadani)];
  return [...new Set(s.placanja.map((x) => platiteljPlacanja(x, zadani)))];
}

export function prviMjesec(p: Podaci): string | undefined {
  return p.placanja.reduce<string | undefined>((a, x) => (!a || x.datum < a ? x.datum : a), undefined)?.slice(0, 7);
}
