import { useState } from 'react';
import { imaPlatitelje, otvorenPlan, platiteljPlacanja, rataZa, stanjeOtplate, zadaniPlatitelj } from '../domain/calc';
import { eur, godina, mjesec, nazivMjeseca, prikazDatuma } from '../domain/dates';
import { VRSTE, type Vrsta } from '../domain/types';
import { useStanje } from '../state';
import { bojaGrupe, Kartica, Oznaka, PlatiteljFilter } from './common';
import { PopisPlacanja } from './Placanja';
import { RezijaForma } from './Rezija';
import type { Ruta } from '../App';

export function RezijeStranica(props: { idi: (r: Ruta) => void }) {
  const { podaci } = useStanje();
  const [nova, setNova] = useState(false);
  const [neaktivne, setNeaktivne] = useState(false);
  const lista = podaci.rezije
    .filter((r) => r.vrsta !== 'obrok' && r.vrsta !== 'kredit')
    .filter((r) => neaktivne || r.aktivna)
    .sort((a, b) => a.redoslijed - b.redoslijed);
  const grupe = [...new Set(lista.map((r) => r.grupa))];
  const zadnje = (id: string) => podaci.placanja.filter((x) => x.rezijaId === id).sort((a, b) => (a.datum < b.datum ? -1 : 1)).pop();
  const brojNeaktivnih = podaci.rezije.filter((r) => !r.aktivna && r.vrsta !== 'obrok' && r.vrsta !== 'kredit').length;
  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <h1>Režije</h1>
        <div className="akcije">
          <button className="primarno" onClick={() => setNova(true)}>+ Nova režija</button>
        </div>
      </div>
      {grupe.map((g) => (
        <Kartica key={g} naslov={<><span className="tocka" style={{ background: g === 'Jednokratno' ? 'var(--muted)' : bojaGrupe(podaci, g) }} />{g}</>}>
          <div className="popis">
            {lista.filter((r) => r.grupa === g).map((r) => {
              const z = zadnje(r.id);
              return (
                <button key={r.id} className="popis-stavka" onClick={() => props.idi({ stranica: 'rezija', id: r.id })}>
                  <span className="popis-naziv">
                    {r.naziv}
                    {!r.aktivna && <Oznaka vrsta="neutralno">neaktivna</Oznaka>}
                  </span>
                  <span className="muted">{VRSTE.find((v) => v.id === r.vrsta)?.naziv}</span>
                  <span className="br">{z ? <>{eur(z.iznos)} <span className="muted mali">{prikazDatuma(z.datum)}</span></> : <span className="muted">–</span>}</span>
                </button>
              );
            })}
          </div>
        </Kartica>
      ))}
      {brojNeaktivnih > 0 && (
        <button className="tekst-gumb" onClick={() => setNeaktivne(!neaktivne)}>
          {neaktivne ? 'Sakrij neaktivne' : `Prikaži neaktivne (${brojNeaktivnih})`}
        </button>
      )}
      {nova && <RezijaForma zatvori={() => setNova(false)} nakon={(id) => id && props.idi({ stranica: 'rezija', id })} />}
    </div>
  );
}

export function ObrociStranica(props: { idi: (r: Ruta) => void }) {
  const { podaci, sada } = useStanje();
  const [nova, setNova] = useState<Vrsta | null>(null);
  const lista = podaci.rezije.filter((r) => r.vrsta === 'obrok' || r.vrsta === 'kredit');
  const aktivni = lista.filter((r) => r.aktivna && (otvorenPlan(r) || (stanjeOtplate(podaci, r, sada).zavrsava ?? '') >= sada));
  const zavrseni = lista.filter((r) => !aktivni.includes(r)).sort((a, b) => ((stanjeOtplate(podaci, a, sada).zavrsava ?? '') < (stanjeOtplate(podaci, b, sada).zavrsava ?? '') ? 1 : -1));
  const mjesecno = aktivni.reduce((a, r) => a + rataZa(podaci.promjeneRata, r, sada).iznos, 0);
  const [pokaziZavrsene, setPokaziZavrsene] = useState(false);

  const red = (r: (typeof lista)[number]) => {
    const s = stanjeOtplate(podaci, r, sada);
    const otv = otvorenPlan(r);
    return (
      <button key={r.id} className="popis-stavka obrok" onClick={() => props.idi({ stranica: 'rezija', id: r.id })}>
        <span className="popis-naziv">
          {r.naziv} <span className="muted mali">{r.vrsta === 'kredit' ? 'kredit' : 'obroci'}</span>
        </span>
        <span>
          {otv ? (
            <Oznaka vrsta="upozorenje">kraj nije upisan</Oznaka>
          ) : (
            <>
              <span className="traka mala" aria-hidden><span style={{ width: `${(s.placenoRata / Math.max(1, s.plan.length)) * 100}%` }} /></span>
              <span className="muted mali">{s.placenoRata}/{s.plan.length} · do {s.zavrsava ? nazivMjeseca(s.zavrsava) : ''}</span>
            </>
          )}
        </span>
        <span className="br">
          {eur(rataZa(podaci.promjeneRata, r, sada).iznos)}
          {!otv && s.preostaloIznos > 0 && <span className="muted mali"> · još {eur(s.preostaloIznos)}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <h1>Obroci i krediti</h1>
        <div className="akcije">
          <button onClick={() => setNova('kredit')}>+ Kredit</button>
          <button className="primarno" onClick={() => setNova('obrok')}>+ Obročna otplata</button>
        </div>
      </div>
      <div className="plocice">
        <div className="plocica">
          <span className="plocica-naslov">Mjesečno na rate</span>
          <span className="plocica-broj">{eur(mjesecno)}</span>
          <span className="plocica-opis">{aktivni.length} aktivnih</span>
        </div>
      </div>
      <Kartica naslov="Aktivni">
        <div className="popis">{aktivni.length ? aktivni.map(red) : <p className="muted">Nema aktivnih otplata.</p>}</div>
      </Kartica>
      {zavrseni.length > 0 && (
        <Kartica naslov="Završeni" akcije={<button className="tekst-gumb" onClick={() => setPokaziZavrsene(!pokaziZavrsene)}>{pokaziZavrsene ? 'Sakrij' : `Prikaži (${zavrseni.length})`}</button>}>
          {pokaziZavrsene && <div className="popis">{zavrseni.map(red)}</div>}
        </Kartica>
      )}
      {nova && <RezijaForma vrsta={nova} zatvori={() => setNova(null)} nakon={(id) => id && props.idi({ stranica: 'rezija', id })} />}
    </div>
  );
}

export function PovijestStranica() {
  const { podaci, platitelj } = useStanje();
  const zadani = zadaniPlatitelj(podaci);
  const odabrana = podaci.placanja.filter((p) => platitelj === null || platiteljPlacanja(p, zadani) === platitelj);
  const godine = [...new Set(podaci.placanja.map((p) => godina(mjesec(p.datum))))].sort().reverse();
  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <h1>Sva plaćanja</h1>
      </div>
      {imaPlatitelje(podaci) && (
        <div className="filteri">
          <span className="muted mali">Platitelj</span>
          <PlatiteljFilter />
        </div>
      )}
      <div className="plocice">
        {godine.slice(0, 4).map((g) => {
          const sve = odabrana.filter((p) => p.datum.startsWith(String(g)));
          const ukupnoSvi = platitelj === null ? undefined : podaci.placanja.filter((p) => p.datum.startsWith(String(g)) && !podaci.rezije.some((r) => r.id === p.rezijaId && r.vrsta === 'jednokratno')).reduce((a, p) => a + p.iznos + (p.naknada ?? 0), 0);
          const jednokratno = new Set(podaci.rezije.filter((r) => r.vrsta === 'jednokratno').map((r) => r.id));
          const redovno = sve.filter((p) => !jednokratno.has(p.rezijaId)).reduce((a, p) => a + p.iznos + (p.naknada ?? 0), 0);
          const jedn = sve.filter((p) => jednokratno.has(p.rezijaId)).reduce((a, p) => a + p.iznos, 0);
          return (
            <div key={g} className="plocica">
              <span className="plocica-naslov">{g}.</span>
              <span className="plocica-broj">{eur(redovno)}</span>
              <span className="plocica-opis">
                {ukupnoSvi !== undefined && <>{platitelj} · svi {eur(ukupnoSvi)}</>}
                {ukupnoSvi === undefined && (jedn > 0 ? `+ jednokratno ${eur(jedn)}` : 'redovni troškovi')}
              </span>
            </div>
          );
        })}
      </div>
      <Kartica>
        <PopisPlacanja limit={60} platitelj={platitelj} />
      </Kartica>
    </div>
  );
}
