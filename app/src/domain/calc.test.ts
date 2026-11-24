import { describe, expect, it } from 'vitest';
import { filtrirajMjesec, planiraniOdvozi, podsjetnici, sljedeciOdvoz, obracunaj, planOtplate, poPlatiteljima, pregledMjeseca, serijaBrojila, sveSerije } from './calc';
import type { Podaci, Rezija, StavkaCjenika } from './types';
import { ZADANE_POSTAVKE } from './types';
import { citajDatoteku, zapisiDatoteku } from './workbook';

const struja: Rezija = { id: 'struja', naziv: 'Struja', vrsta: 'struja', grupa: 'Režije', aktivna: true, redoslijed: 1 };

const s = (stavka: string, osnovica: StavkaCjenika['osnovica'], cijena: number, o: Partial<StavkaCjenika> = {}): StavkaCjenika => ({
  id: stavka, rezijaId: 'struja', vrijediOd: '2026-01', stavka, osnovica, cijena, uPdv: true, zaokruzi: true, ...o,
});
const cjenik2026 = [
  s('Distribucija VT', 'vt', 0.044446), s('Prijenos VT', 'vt', 0.021256), s('Energija VT', 'vt', 0.097189, { cijenaIznadPraga: 0.131205 }), s('OIE VT', 'vt', 0.013239),
  s('Distribucija NT', 'nt', 0.020514), s('Prijenos NT', 'nt', 0.008175), s('Energija NT', 'nt', 0.047688, { cijenaIznadPraga: 0.064379 }), s('OIE NT', 'nt', 0.013239),
  s('Mjerna usluga', 'fiksno', 1.983), s('Opskrbna naknada', 'fiksno', 0.982), s('PDV', 'pdv', 0.13, { uPdv: false, zaokruzi: false }),
];

function podaci(extra: Partial<Podaci> = {}): Podaci {
  return { rezije: [struja], placanja: [], ocitanja: [], cjenici: cjenik2026, vauceri: [], promjeneRata: [], rasporedi: [], postavke: ZADANE_POSTAVKE, ...extra };
}

describe('obračun struje', () => {
  it('odgovara Excel formuli (siječanj 2026: 419 VT, 153 NT = 102,24 €)', () => {
    expect(obracunaj(cjenik2026, { vt: 419, nt: 153 }).ukupno).toBe(102.24);
  });
  it('višak iznad praga po višoj cijeni (ožujak 2026: 99,25 €)', () => {
    expect(obracunaj(cjenik2026, { vt: 348, nt: 194, vtIznad: 143, ntIznad: 79 }).ukupno).toBe(99.25);
  });
});

describe('potrošnja iz očitanja', () => {
  it('produži očitanje do kraja mjeseca kao u Excelu', () => {
    const p = podaci({
      ocitanja: [
        { id: 'a', rezijaId: 'struja', datum: '2026-09-30', vrsta: 'ocitanje', vrijednost: 1000, nt: 500 },
        { id: 'b', rezijaId: 'struja', datum: '2026-10-15', vrsta: 'ocitanje', vrijednost: 1150, nt: 575 },
      ],
    });
    const e = serijaBrojila(p, struja, { sada: '2026-10', unaprijed: 0 }).find((x) => x.mjesec === '2026-10')!;
    // 31 dan / 15 dana očitanja
    expect(e.vt).toBe(310);
    expect(e.nt).toBe(155);
  });
  it('zamjena brojila nastavlja potrošnju', () => {
    const p = podaci({
      ocitanja: [
        { id: 'a', rezijaId: 'struja', datum: '2026-04-30', vrsta: 'ocitanje', vrijednost: 54000, nt: 23000 },
        { id: 'z', rezijaId: 'struja', datum: '2026-05-31', vrsta: 'zamjena', vrijednost: 54300, nt: 23100 },
        { id: 'b', rezijaId: 'struja', datum: '2026-05-31', vrsta: 'ocitanje', vrijednost: 100, nt: 50 },
      ],
    });
    const e = serijaBrojila(p, struja, { sada: '2026-05', unaprijed: 0 }).find((x) => x.mjesec === '2026-05')!;
    expect([e.vt, e.nt]).toEqual([400, 150]);
  });
  it('vaučer umanjuje iznos, ne ispod nule', () => {
    const p = podaci({
      vauceri: [{ id: 'v', rezijaId: 'struja', vrijediOd: '2026-01', iznos: 70, komadaMjesecno: 1 }],
      ocitanja: [
        { id: 'a', rezijaId: 'struja', datum: '2026-09-30', vrsta: 'ocitanje', vrijednost: 1000, nt: 500 },
        { id: 'b', rezijaId: 'struja', datum: '2026-10-31', vrsta: 'ocitanje', vrijednost: 1100, nt: 550 },
      ],
    });
    const e = serijaBrojila(p, struja, { sada: '2026-10', unaprijed: 0 }).find((x) => x.mjesec === '2026-10')!;
    expect(e.racun).toBeLessThan(70);
    expect(e.zaPlatiti).toBe(0);
  });
});

describe('obroci', () => {
  const r: Rezija = { id: 'o', naziv: 'Perilica', vrsta: 'obrok', grupa: 'Obroci', aktivna: true, redoslijed: 2, iznosRate: 45.5, prvaRata: '2026-12-31', brojRata: 3 };
  it('plan s krajem mjeseca', () => {
    expect(planOtplate(r).map((x) => x.datum)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
  });
  it('rata ulazi u očekivani trošak mjeseca', () => {
    const p = podaci({ rezije: [r] });
    const m = pregledMjeseca(p, '2027-01', '2026-12', sveSerije(p, '2026-12'));
    expect(m.ocekivano).toBe(45.5);
    expect(pregledMjeseca(p, '2027-03', '2026-12', sveSerije(p, '2026-12')).ukupno).toBe(0);
  });
});

describe('promjena rate (APN kredit)', () => {
  const k: Rezija = { id: 'k', naziv: 'Stambeni', vrsta: 'kredit', grupa: 'Krediti', aktivna: true, redoslijed: 3, iznosRate: 272.51, prvaRata: '2020-12-05', brojRata: 240 };
  const promjeneRata = [{ id: 'p', rezijaId: 'k', vrijediOd: '2029-12', iznos: 400, procjena: true }];
  it('rate od promjene imaju novi iznos', () => {
    const plan = planOtplate(k, promjeneRata);
    expect(plan[107]).toMatchObject({ mjesec: '2029-11', iznos: 272.51 });
    expect(plan[108]).toMatchObject({ mjesec: '2029-12', iznos: 400, procjena: true });
    expect(plan[108].promjena?.id).toBe('p');
    expect(plan[239]).toMatchObject({ mjesec: '2040-11', iznos: 400 });
  });
  it('procjena i preostali iznos koriste novu ratu', () => {
    const p = podaci({ rezije: [k], promjeneRata });
    const m = pregledMjeseca(p, '2029-12', '2026-11', sveSerije(p, '2026-11'));
    expect(m.ocekivano).toBe(400);
    expect(m.stavke[0].napomena).toContain('procjena');
  });
});

describe('platitelji', () => {
  const vrtic: Rezija = { id: 'vrtic', naziv: 'Vrtić', vrsta: 'jednostavna', grupa: 'Djeca', aktivna: true, redoslijed: 4 };
  const internet: Rezija = { id: 'net', naziv: 'Internet', vrsta: 'jednostavna', grupa: 'Režije', aktivna: true, redoslijed: 5, platitelj: 'B' };
  const kredit: Rezija = { id: 'k', naziv: 'Kredit', vrsta: 'kredit', grupa: 'Krediti', aktivna: true, redoslijed: 6, iznosRate: 100, prvaRata: '2026-01-10', brojRata: 24, platitelj: 'A' };
  const p = podaci({
    rezije: [vrtic, internet, kredit],
    postavke: { ...ZADANE_POSTAVKE, platitelji: ['A', 'B'] },
    placanja: [
      { id: '1', datum: '2026-10-05', rezijaId: 'vrtic', iznos: 60, platitelj: 'A' },
      { id: '2', datum: '2026-11-05', rezijaId: 'vrtic', iznos: 60, platitelj: 'B' },
      { id: '3', datum: '2026-11-08', rezijaId: 'net', iznos: 30, naknada: 0.5 },
      { id: '4', datum: '2026-11-09', rezijaId: 'net', iznos: 5, platitelj: 'A' },
    ],
  });
  const m = pregledMjeseca(p, '2026-11', '2026-11', sveSerije(p, '2026-11'));
  it('plaćanje bez platitelja ide zadanom platitelju (prvom), ne platitelju s režije', () => {
    expect(filtrirajMjesec(m, 'B', 'A').ukupno).toBe(60);
    expect(filtrirajMjesec(m, 'A', 'A').placeno).toBe(30.5 + 5);
  });
  it('očekivana rata ide platitelju s režije', () => {
    const p2 = podaci({ ...p, rezije: [vrtic, internet, { ...kredit, platitelj: 'B' }] });
    const m2 = pregledMjeseca(p2, '2026-11', '2026-11', sveSerije(p2, '2026-11'));
    expect(filtrirajMjesec(m2, 'B', 'A').ocekivano).toBe(100);
    expect(filtrirajMjesec(m2, 'A', 'A').ocekivano).toBe(0);
  });
  it('zbroj po platiteljima jednak je ukupnom', () => {
    const r = poPlatiteljima(m, ['A', 'B']);
    expect(r.reduce((s, x) => s + x.mjesec.ukupno, 0)).toBeCloseTo(m.ukupno, 2);
    expect(filtrirajMjesec(m, null, 'A')).toBe(m);
  });
});

describe('odvoz smeća', () => {
  const smece: Rezija = { id: 'smece', naziv: 'Smeće', vrsta: 'smece', grupa: 'Režije', aktivna: true, redoslijed: 7 };
  const p = podaci({
    rezije: [smece],
    rasporedi: [{ id: 'r1', rezijaId: 'smece', prviOdvoz: '2026-01-07', svakihTjedana: 1 }],
    ocitanja: [
      { id: 'a', rezijaId: 'smece', datum: '2026-11-04', vrsta: 'odvoz', vrijednost: 1 },
      { id: 'b', rezijaId: 'smece', datum: '2026-11-11', vrsta: 'odvoz', vrijednost: 1 },
    ],
  });
  it('blagdan na dan odvoza pomiče odvoz na sljedeći radni dan', () => {
    // 18.11.2026. je srijeda i blagdan; 23.12. srijeda, 25.12. petak
    const nov = planiraniOdvozi(p, 'smece', '2026-11-01', '2026-11-30').map((x) => x.datum);
    expect(nov).toEqual(['2026-11-04', '2026-11-11', '2026-11-19', '2026-11-25']);
    expect(sljedeciOdvoz(p, 'smece', '2026-11-12')).toMatchObject({ datum: '2026-11-19', pomak: 'Dan sjećanja na žrtve Domovinskog rata' });
  });
  it('promjena dana odvoza vrijedi od novog rasporeda', () => {
    const p2 = podaci({ ...p, rasporedi: [...p.rasporedi, { id: 'r2', rezijaId: 'smece', prviOdvoz: '2026-12-03', svakihTjedana: 2 }] });
    expect(planiraniOdvozi(p2, 'smece', '2026-11-25', '2026-12-31').map((x) => x.datum)).toEqual(['2026-11-25', '2026-12-02', '2026-12-03', '2026-12-17', '2026-12-31']);
  });
  it('tekući mjesec: upisani odvozi + planirani do kraja mjeseca', () => {
    const e = serijaBrojila(p, smece, { sada: '2026-11', unaprijed: 1 }).find((x) => x.mjesec === '2026-11')!;
    expect(e.doSada).toBe(2);
    expect(e.kolicina).toBe(4);
  });
});

describe('podsjetnici za očitanje', () => {
  const voda: Rezija = { id: 'voda', naziv: 'Voda', vrsta: 'voda', grupa: 'Režije', aktivna: true, redoslijed: 2 };
  it('voda 15.–25., struja zadnjih 7 dana; prijava se prati', () => {
    const p = podaci({
      rezije: [struja, voda],
      ocitanja: [
        { id: 'a', rezijaId: 'struja', datum: '2026-11-21', vrsta: 'ocitanje', vrijednost: 1, nt: 1 },
        { id: 'b', rezijaId: 'voda', datum: '2026-11-20', vrsta: 'ocitanje', vrijednost: 5 },
      ],
    });
    expect(podsjetnici(p, '2026-11-14')).toEqual([]);
    const x = podsjetnici(p, '2026-11-24');
    expect(x.map((y) => [y.rezija.id, y.vrsta, y.od])).toEqual([['struja', 'unesi', '2026-11-24'], ['voda', 'prijavi', '2026-11-15']]);
    p.ocitanja[1].prijavljeno = true;
    expect(podsjetnici(p, '2026-11-26').map((y) => [y.rezija.id, y.kasni])).toEqual([['struja', false]]);
  });
});

describe('datoteka', () => {
  it('zapiši i pročitaj daje iste podatke', () => {
    const p = podaci({
      placanja: [{ id: 'p1', datum: '2026-11-08', rezijaId: 'struja', zaMjesec: '2026-10', iznos: 14.58, racun: 84.57, vauceri: 1, naknada: 0.33, platitelj: 'Ana' }],
      ocitanja: [{ id: 'a', rezijaId: 'struja', datum: '2026-09-30', vrsta: 'ocitanje', vrijednost: 1000, nt: 500 }],
      postavke: { ...ZADANE_POSTAVKE, platitelji: ['Ana', 'Marko Ivić'] },
      promjeneRata: [
        { id: 'r1', rezijaId: 'k', vrijediOd: '2029-12', iznos: 400, procjena: true, napomena: 'kraj APN subvencije' },
        { id: 'r2', rezijaId: 'k', vrijediOd: '2031-01', iznos: 390 },
      ],
    });
    const p2 = citajDatoteku(zapisiDatoteku(p));
    expect(p2.placanja).toEqual(p.placanja);
    expect(p2.ocitanja).toEqual(p.ocitanja);
    expect(p2.cjenici).toEqual(p.cjenici);
    expect(p2.postavke).toEqual(p.postavke);
    expect(p2.promjeneRata).toEqual(p.promjeneRata);
  });
});
