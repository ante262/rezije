import { useMemo, useState } from 'react';
import { filtrirajMjesec, imaPlatitelje, platiteljiStavke, poPlatiteljima, pregledMjeseca, prviMjesec, trenutniPrag, zadaniPlatitelj, type StavkaMjeseca } from '../domain/calc';
import { broj, datumUMjesecu, danas, dodajMjesece, eur, mjesec, nazivMjeseca, rasponMjeseci, round2 } from '../domain/dates';
import type { Placanje } from '../domain/types';
import { useStanje } from '../state';
import { bojaGrupe, grupe, Kartica, MjesecBirac, Oznaka, PlatiteljFilter } from './common';
import { MjesecniGraf } from './Grafovi';
import { OcitanjeForma } from './Brojilo';
import { PlacanjeForma } from './Placanja';
import { OdvozForma } from './Odvoz';
import { Podsjetnici } from './Podsjetnici';
import type { Rezija } from '../domain/types';

const NAZIVI_OCITANJA: Record<string, string> = { struja: 'Očitanje struje', voda: 'Očitanje vode', plin: 'Očitanje plina' };
const gumbOcitanja = (r: Rezija) => NAZIVI_OCITANJA[r.naziv.trim().toLowerCase()] ?? `Očitanje: ${r.naziv}`;
import type { Ruta } from '../App';

const RASPONI = [
  { id: 12, naziv: '12 mj.' },
  { id: 24, naziv: '2 god.' },
  { id: 60, naziv: '5 god.' },
] as const;
const UNAPRIJED = [
  { id: 6, naziv: '6 mj.' },
  { id: 12, naziv: '1 god.' },
  { id: 24, naziv: '2 god.' },
] as const;

export function Pregled(props: { idi: (r: Ruta) => void }) {
  const { podaci, sada, serije, platitelj, unaprijed, setUnaprijed } = useStanje();
  const platitelji = podaci.postavke.platitelji;
  const zadani = zadaniPlatitelj(podaci);
  const svi = useMemo(() => new Map<string, ReturnType<typeof pregledMjeseca>>(), [podaci, sada, serije]); // eslint-disable-line react-hooks/exhaustive-deps
  const mjesecSvi = (m: string) => {
    if (!svi.has(m)) svi.set(m, pregledMjeseca(podaci, m, sada, serije));
    return svi.get(m)!;
  };
  const pregled = (m: string) => filtrirajMjesec(mjesecSvi(m), platitelj, zadani);
  const [odabran, setOdabran] = useState(sada);
  const [raspon, setRaspon] = useState<number>(24);
  const [placanje, setPlacanje] = useState<Partial<Placanje> | null>(null);
  const [ocitanje, setOcitanje] = useState<string | null>(null);
  const [odvoz, setOdvoz] = useState<string | null>(null);
  const brojila = podaci.rezije.filter((r) => r.aktivna && (r.vrsta === 'struja' || r.vrsta === 'voda')).sort((a, b) => a.redoslijed - b.redoslijed);
  const smeca = podaci.rezije.filter((r) => r.aktivna && r.vrsta === 'smece');

  const prvi = prviMjesec(podaci) ?? sada;
  const zadnji = dodajMjesece(sada, unaprijed);
  const mjeseci = useMemo(() => {
    const od = [dodajMjesece(sada, -raspon + 1), prvi].sort()[1];
    return rasponMjeseci(od, zadnji).map(pregled);
  }, [svi, platitelj, raspon, prvi, zadnji]); // eslint-disable-line react-hooks/exhaustive-deps
  const gr = grupe(podaci);
  const grafPodaci = mjeseci.map((m) => {
    const o: Record<string, number | string | boolean> = { mjesec: m.mjesec, procjena: m.mjesec > sada || (m.mjesec === sada && m.ocekivano > 0) };
    for (const g of gr) o[g] = round2(m.stavke.filter((s) => s.rezija.grupa === g).reduce((a, s) => a + s.iznos + s.naknada, 0));
    return o as { mjesec: string; procjena: boolean } & Record<string, number>;
  });

  const ovaj = pregled(odabran);
  const sljedeci = pregled(dodajMjesece(sada, 1));
  const tekuci = pregled(sada);
  const prosli12 = rasponMjeseci(dodajMjesece(sada, -12), dodajMjesece(sada, -1)).map((m) => pregled(m).ukupno);
  const raspodjela = imaPlatitelje(podaci) && platitelj === null ? poPlatiteljima(mjesecSvi(odabran), platitelji) : [];
  const prosjek = prosli12.reduce((a, x) => a + x, 0) / Math.max(1, prosli12.length);

  const struja = podaci.rezije.find((r) => r.vrsta === 'struja' && r.aktivna);
  const prag = struja && serije.get(struja.id) ? trenutniPrag(podaci, serije.get(struja.id)!, sada) : undefined;

  const plati = (s: StavkaMjeseca) => {
    const r = s.rezija;
    const brojilo = ['struja', 'voda', 'smece'].includes(r.vrsta);
    setPlacanje({
      rezijaId: r.id,
      datum: odabran === mjesec(danas()) ? danas() : datumUMjesecu(odabran, r.danPlacanja ?? 1),
      zaMjesec: brojilo ? dodajMjesece(odabran, -1) : undefined,
      iznos: s.iznos,
      naknada: s.naknada || undefined,
      platitelj: s.rezija.platitelj,
    });
  };

  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <h1>Pregled</h1>
        <div className="akcije">
          {brojila.map((r) => (
            <button key={r.id} onClick={() => setOcitanje(r.id)}>{gumbOcitanja(r)}</button>
          ))}
          {smeca.map((r) => (
            <button key={r.id} onClick={() => setOdvoz(r.id)}>+ Odvoz{smeca.length > 1 ? ` (${r.naziv})` : ''}</button>
          ))}
          <button className="primarno" onClick={() => setPlacanje({})}>+ Plaćanje</button>
        </div>
      </div>

      <Podsjetnici odvoz />

      {imaPlatitelje(podaci) && (
        <div className="filteri">
          <span className="muted mali">Platitelj</span>
          <PlatiteljFilter />
          {platitelj !== null && (
            <span className="muted mali">
              ukupno za sve ovaj mjesec: {eur(mjesecSvi(sada).ukupno)}
            </span>
          )}
        </div>
      )}

      <div className="plocice">
        <div className="plocica">
          <span className="plocica-naslov">Ovaj mjesec · {nazivMjeseca(sada)}</span>
          <span className="plocica-broj">{eur(tekuci.ukupno)}</span>
          <span className="plocica-opis">
            plaćeno {eur(tekuci.placeno)}{tekuci.ocekivano > 0 && <> · još ~{eur(tekuci.ocekivano)}</>}
          </span>
        </div>
        <div className="plocica">
          <span className="plocica-naslov">Sljedeći mjesec · procjena</span>
          <span className="plocica-broj">{eur(sljedeci.ukupno)}</span>
          <span className="plocica-opis">{nazivMjeseca(dodajMjesece(sada, 1))}</span>
        </div>
        <div className="plocica">
          <span className="plocica-naslov">Prosjek zadnjih 12 mj.</span>
          <span className="plocica-broj">{eur(prosjek)}</span>
          <span className="plocica-opis">godišnje {eur(prosli12.reduce((a, x) => a + x, 0))}</span>
        </div>
        {prag && (
          <button className="plocica klik" onClick={() => props.idi({ stranica: 'rezija', id: struja!.id })}>
            <span className="plocica-naslov">Struja · prag {broj(prag.prag)} kWh</span>
            <span className="plocica-broj">
              {broj(prag.stvarno)} <small>kWh</small>
            </span>
            <span className="plocica-opis">
              {nazivMjeseca(prag.od).split(' ')[0]} – {nazivMjeseca(prag.do)} · procjena {broj(prag.procjena)}
              {prag.procjena > prag.prag && <Oznaka vrsta="upozorenje">iznad praga</Oznaka>}
            </span>
            <span className="traka" aria-hidden>
              <span style={{ width: `${Math.min(100, (prag.stvarno / prag.prag) * 100)}%` }} />
              <span className="procjena" style={{ width: `${Math.max(0, Math.min(100, ((prag.procjena - prag.stvarno) / prag.prag) * 100))}%` }} />
            </span>
          </button>
        )}
      </div>

      <Kartica
        naslov="Mjesečni troškovi"
        akcije={
          <div className="graf-izbori">
            <span className="muted mali">unatrag</span>
            <div className="segment" role="group" aria-label="Razdoblje unatrag">
              {RASPONI.map((r) => (
                <button key={r.id} className={raspon === r.id ? 'aktivno' : ''} onClick={() => setRaspon(r.id)}>{r.naziv}</button>
              ))}
            </div>
            <span className="muted mali">procjena</span>
            <div className="segment" role="group" aria-label="Procjena unaprijed">
              {UNAPRIJED.map((r) => (
                <button key={r.id} className={unaprijed === r.id ? 'aktivno' : ''} onClick={() => setUnaprijed(r.id)}>{r.naziv}</button>
              ))}
            </div>
          </div>
        }
      >
        <MjesecniGraf podaci={grafPodaci} serije={gr.filter((g) => grafPodaci.some((d) => d[g] > 0)).map((g) => ({ kljuc: g, boja: bojaGrupe(podaci, g) }))} odabran={odabran} klik={setOdabran} />
        <p className="biljeska">Svjetliji stupci su procjena. Klikni na stupac za detalje mjeseca.</p>
      </Kartica>

      <Kartica
        naslov={<MjesecBirac mjesec={odabran} promjena={setOdabran} min={prvi} max={zadnji} />}
        akcije={
          <span className="zbroj">
            {raspodjela.map((x) => (
              <span key={x.platitelj} className="muted">{x.platitelj} <b>{eur(x.mjesec.ukupno)}</b></span>
            ))}
            {ovaj.placeno > 0 && <span>plaćeno <b>{eur(ovaj.placeno)}</b></span>}
            {ovaj.ocekivano > 0 && <span>očekivano <b>{eur(ovaj.ocekivano)}</b></span>}
            <span>{platitelj !== null ? `${platitelj} ukupno` : 'ukupno'} <b>{eur(ovaj.ukupno)}</b></span>
            {platitelj !== null && <span className="muted">svi <b>{eur(mjesecSvi(odabran).ukupno)}</b></span>}
          </span>
        }
      >
        <div className="tablica-omot">
          <table className="tablica">
            <thead>
              <tr>
                <th>Režija</th>
                <th>Status</th>
                <th className="br">Iznos</th>
                <th className="br sakrij-mob">Naknada</th>
                {imaPlatitelje(podaci) && <th className="sakrij-mob">Platitelj</th>}
                <th className="sakrij-mob">Napomena</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ovaj.stavke.map((s) => (
                <tr key={s.rezija.id} className="klik" onClick={() => props.idi({ stranica: 'rezija', id: s.rezija.id })}>
                  <td>
                    <span className="tocka" style={{ background: bojaGrupe(podaci, s.rezija.grupa) }} />
                    {s.rezija.naziv}
                  </td>
                  <td>
                    {s.status === 'placeno' && <Oznaka vrsta="placeno">plaćeno</Oznaka>}
                    {s.status === 'ocekivano' && <Oznaka vrsta="ocekivano">očekivano</Oznaka>}
                    {s.status === 'automatski' && <Oznaka vrsta="automatski">rata</Oznaka>}
                  </td>
                  <td className="br">{s.status === 'ocekivano' ? '~' : ''}{eur(s.iznos)}</td>
                  <td className="br muted sakrij-mob">{s.naknada ? eur(s.naknada) : ''}</td>
                  {imaPlatitelje(podaci) && (
                    <td className="muted sakrij-mob">{platiteljiStavke(s, zadani).join(', ')}</td>
                  )}
                  <td className="muted sakrij-mob">{s.napomena ?? s.placanja.map((x) => x.napomena).filter(Boolean).join('; ')}</td>
                  <td className="br">
                    {s.status === 'ocekivano' && (
                      <button className="malo" onClick={(e) => { e.stopPropagation(); plati(s); }}>Plati</button>
                    )}
                  </td>
                </tr>
              ))}
              {!ovaj.stavke.length && (
                <tr><td colSpan={7} className="prazno">Nema troškova u ovom mjesecu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Kartica>

      {placanje && <PlacanjeForma pocetno={placanje} zatvori={() => setPlacanje(null)} />}
      {odvoz && <OdvozForma rezijaId={odvoz} zatvori={() => setOdvoz(null)} />}
      {ocitanje && <OcitanjeForma rezijaId={ocitanje} zatvori={() => setOcitanje(null)} />}
    </div>
  );
}
