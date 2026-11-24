import { useState } from 'react';
import { podsjetnici, prijavaZa, sljedeciOdvoz } from '../domain/calc';
import { danas, imeDana, prikazDatuma } from '../domain/dates';
import { useStanje } from '../state';
import { OcitanjeForma } from './Brojilo';

const rokTekst = (od: string, doD: string) => `${Number(od.slice(8))}.–${prikazDatuma(doD)}`;

/** Crvene oznake: očitanje u roku nije uneseno ili nije prijavljeno distributeru. */
export function Podsjetnici(props: { rezijaId?: string; odvoz?: boolean }) {
  const { podaci, izmijeni } = useStanje();
  const [unos, setUnos] = useState<string | null>(null);
  const lista = podsjetnici(podaci, danas()).filter((x) => !props.rezijaId || x.rezija.id === props.rezijaId);
  const smece = props.odvoz ? podaci.rezije.filter((r) => r.aktivna && r.vrsta === 'smece') : [];
  const odvozi = smece.map((r) => ({ r, s: sljedeciOdvoz(podaci, r.id, danas()) })).filter((x) => x.s);
  if (!lista.length && !odvozi.length) return null;

  const oznaciPrijavljeno = (id: string) =>
    izmijeni((d) => ({ ...d, ocitanja: d.ocitanja.map((o) => (o.id === id ? { ...o, prijavljeno: true } : o)) }));

  return (
    <div className="podsjetnici">
      {lista.map((x) => (
        <div key={x.rezija.id} className="podsjetnik hitno" role="alert">
          <span className="zastavica" aria-hidden>⚑</span>
          <span className="rasteg">
            {x.vrsta === 'unesi' ? (
              <>
                <b>{x.rezija.naziv}: unesi očitanje</b>
                <span className="muted mali blok">
                  {x.kasni ? `rok je bio ${rokTekst(x.od, x.do)}` : `rok ${rokTekst(x.od, x.do)}`} · zatim prijavi ({prijavaZa(x.rezija)})
                </span>
              </>
            ) : (
              <>
                <b>
                  {x.rezija.naziv}: prijavi očitanje ({prijavaZa(x.rezija)})
                </b>
                <span className="muted mali blok">
                  uneseno {prikazDatuma(x.ocitanje!.datum)} · {x.kasni ? `rok je bio ${rokTekst(x.od, x.do)}` : `rok ${rokTekst(x.od, x.do)}`}
                </span>
              </>
            )}
          </span>
          {x.vrsta === 'unesi' ? (
            <button className="malo primarno" onClick={() => setUnos(x.rezija.id)}>Unesi</button>
          ) : (
            <button className="malo" onClick={() => oznaciPrijavljeno(x.ocitanje!.id)}>Prijavljeno ✓</button>
          )}
        </div>
      ))}
      {odvozi.map(({ r, s }) => (
        <div key={r.id} className="podsjetnik">
          <span className="zastavica info" aria-hidden>●</span>
          <span className="rasteg">
            <b>{r.naziv}: sljedeći odvoz {s!.datum === danas() ? 'danas' : `${imeDana(s!.datum)} ${prikazDatuma(s!.datum)}`}</b>
            {s!.pomak && <span className="muted mali blok">pomaknut s {prikazDatuma(s!.planirano)} ({s!.pomak})</span>}
          </span>
        </div>
      ))}
      {unos && <OcitanjeForma rezijaId={unos} zatvori={() => setUnos(null)} />}
    </div>
  );
}
