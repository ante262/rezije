import { useState } from 'react';
import { cjenikZa, obracunaj, razdobljaCjenika } from '../domain/calc';
import { broj, dodajMjesece, eur, nazivMjeseca } from '../domain/dates';
import type { Osnovica, Rezija, StavkaCjenika } from '../domain/types';
import { noviId, useStanje } from '../state';
import { BrojUnos, Kartica, Modal, Polje } from './common';

const OSNOVICE: Record<Rezija['vrsta'], { id: Osnovica; naziv: string }[]> = {
  struja: [
    { id: 'vt', naziv: 'po kWh VT' },
    { id: 'nt', naziv: 'po kWh NT' },
    { id: 'fiksno', naziv: 'mjesečno' },
    { id: 'pdv', naziv: 'stopa PDV-a' },
  ],
  voda: [
    { id: 'kolicina', naziv: 'po jedinici' },
    { id: 'fiksno', naziv: 'mjesečno' },
    { id: 'pdv', naziv: 'stopa PDV-a' },
  ],
  smece: [
    { id: 'kolicina', naziv: 'po odvozu' },
    { id: 'fiksno', naziv: 'mjesečno' },
    { id: 'pdv', naziv: 'stopa PDV-a' },
  ],
  jednostavna: [],
  obrok: [],
  kredit: [],
  jednokratno: [],
};

const cijena = (x: number) => new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(x);

const nazivOsnovice = (r: Rezija, o: Osnovica) => OSNOVICE[r.vrsta].find((x) => x.id === o)?.naziv ?? o;

function UrediCjenik(props: { r: Rezija; od?: string; zatvori: () => void }) {
  const { podaci, izmijeni, serije, sada } = useStanje();
  const { r } = props;
  const novi = !props.od;
  const zadnji = razdobljaCjenika(podaci.cjenici, r.id).pop();
  const izvorne = props.od
    ? podaci.cjenici.filter((c) => c.rezijaId === r.id && c.vrijediOd === props.od)
    : zadnji
      ? podaci.cjenici.filter((c) => c.rezijaId === r.id && c.vrijediOd === zadnji)
      : [];
  const [od, setOd] = useState(props.od ?? sada);
  const [stavke, setStavke] = useState<StavkaCjenika[]>(() =>
    izvorne.length
      ? izvorne.map((s) => ({ ...s, id: novi ? noviId('c') : s.id }))
      : [{ id: noviId('c'), rezijaId: r.id, vrijediOd: sada, stavka: 'PDV', osnovica: 'pdv', cijena: 0.13, uPdv: false, zaokruzi: false }],
  );
  const promijeni = (i: number, izmjena: Partial<StavkaCjenika>) => setStavke(stavke.map((s, j) => (j === i ? { ...s, ...izmjena } : s)));

  // primjer: potrošnja zadnjeg mjeseca s ovim cjenikom
  const primjer = (serije.get(r.id) ?? []).filter((x) => x.izvor === 'ocitanje').pop();
  const obr = primjer ? obracunaj(stavke, { vt: primjer.vt, nt: primjer.nt, kolicina: primjer.kolicina }) : undefined;
  const postoji = novi && podaci.cjenici.some((c) => c.rezijaId === r.id && c.vrijediOd === od);

  const spremi = async () => {
    props.zatvori();
    await izmijeni((d) => ({
      ...d,
      cjenici: [
        ...d.cjenici.filter((c) => !(c.rezijaId === r.id && (c.vrijediOd === od || c.vrijediOd === props.od))),
        ...stavke.filter((s) => s.stavka.trim()).map((s) => ({ ...s, vrijediOd: od, rezijaId: r.id })),
      ],
    }));
  };
  const obrisi = async () => {
    if (!confirm(`Obrisati cjenik koji vrijedi od ${nazivMjeseca(props.od!)}?`)) return;
    props.zatvori();
    await izmijeni((d) => ({ ...d, cjenici: d.cjenici.filter((c) => !(c.rezijaId === r.id && c.vrijediOd === props.od)) }));
  };

  return (
    <Modal naslov={novi ? 'Novi cjenik' : `Cjenik od ${nazivMjeseca(props.od!)}`} zatvori={props.zatvori} sirok>
      <div className="forma">
        <Polje oznaka="Vrijedi od mjeseca potrošnje" pomoc={postoji ? 'cjenik za taj mjesec već postoji i bit će zamijenjen' : undefined}>
          <input type="month" value={od} onChange={(e) => setOd(e.target.value)} />
        </Polje>
      </div>
      <div className="tablica-omot">
        <table className="tablica uredivanje">
          <thead>
            <tr>
              <th>Stavka</th>
              <th>Obračun</th>
              <th className="br">Cijena (€)</th>
              {r.vrsta === 'struja' && <th className="br" title="Cijena za potrošnju iznad praga u razdoblju">Iznad praga</th>}
              <th title="Stavka ulazi u osnovicu za PDV">PDV</th>
              <th title="Zaokruži stavku na 2 decimale">Zaokr.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stavke.map((s, i) => (
              <tr key={s.id}>
                <td><input value={s.stavka} onChange={(e) => promijeni(i, { stavka: e.target.value })} /></td>
                <td>
                  <select value={s.osnovica} onChange={(e) => promijeni(i, { osnovica: e.target.value as Osnovica })}>
                    {OSNOVICE[r.vrsta].map((o) => (
                      <option key={o.id} value={o.id}>{o.naziv}</option>
                    ))}
                  </select>
                </td>
                <td className="br"><BrojUnos vrijednost={s.cijena} promjena={(v) => promijeni(i, { cijena: v ?? 0 })} /></td>
                {r.vrsta === 'struja' && (
                  <td className="br">
                    {(s.osnovica === 'vt' || s.osnovica === 'nt') && (
                      <BrojUnos vrijednost={s.cijenaIznadPraga} promjena={(v) => promijeni(i, { cijenaIznadPraga: v })} placeholder="–" />
                    )}
                  </td>
                )}
                <td>{s.osnovica !== 'pdv' && <input type="checkbox" checked={s.uPdv} onChange={(e) => promijeni(i, { uPdv: e.target.checked })} />}</td>
                <td>{s.osnovica !== 'pdv' && <input type="checkbox" checked={s.zaokruzi} onChange={(e) => promijeni(i, { zaokruzi: e.target.checked })} />}</td>
                <td><button className="ikona" onClick={() => setStavke(stavke.filter((_, j) => j !== i))} aria-label="Ukloni stavku">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="tekst-gumb"
        onClick={() =>
          setStavke([...stavke, { id: noviId('c'), rezijaId: r.id, vrijediOd: od, stavka: '', osnovica: OSNOVICE[r.vrsta][0].id, cijena: 0, uPdv: true, zaokruzi: r.vrsta === 'struja' }])
        }
      >
        + Dodaj stavku
      </button>
      {obr && primjer && (
        <div className="izracun">
          <div>
            <span className="muted">
              Primjer za {nazivMjeseca(primjer.mjesec)} ({r.vrsta === 'struja' ? `${broj(primjer.vt)} + ${broj(primjer.nt)} kWh` : `${broj(primjer.kolicina)}`})
            </span>
            <b>{eur(obr.ukupno)}</b>
            <span className="muted">osnovica s PDV-om {eur(obr.osnovicaPdv)} + PDV {eur(obr.pdv)} + bez PDV-a {eur(obr.bezPdv)}</span>
          </div>
        </div>
      )}
      <footer className="modal-podnozje">
        {!novi && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" onClick={spremi} disabled={!od}>Spremi</button>
      </footer>
    </Modal>
  );
}

export function CjenikKartica(props: { r: Rezija }) {
  const { podaci, sada } = useStanje();
  const { r } = props;
  const [uredi, setUredi] = useState<string | 'novi' | null>(null);
  const [sve, setSve] = useState(false);
  const razdoblja = razdobljaCjenika(podaci.cjenici, r.id).reverse();
  const trenutni = cjenikZa(podaci.cjenici, r.id, sada);
  const prikaz = sve ? razdoblja : razdoblja.slice(0, 1);
  return (
    <Kartica naslov="Cjenik" akcije={<button onClick={() => setUredi('novi')}>+ Nova cijena</button>}>
      {!razdoblja.length && <p className="muted">Nema cjenika. Dodaj ga da bi aplikacija izračunala iznos računa.</p>}
      {prikaz.map((od) => {
        const st = podaci.cjenici.filter((c) => c.rezijaId === r.id && c.vrijediOd === od);
        const k = razdoblja.indexOf(od);
        const doM = k > 0 ? razdoblja[k - 1] : undefined;
        return (
          <div key={od} className="cjenik-razdoblje">
            <div className="cjenik-zaglavlje">
              <b>od {nazivMjeseca(od)}</b>
              {doM && <span className="muted"> do {nazivMjeseca(dodajMjesece(doM, -1))}</span>}
              {trenutni[0]?.vrijediOd === od && <span className="oznaka-status placeno">vrijedi sada</span>}
              <button className="tekst-gumb" onClick={() => setUredi(od)}>Uredi</button>
            </div>
            <table className="tablica kompaktna">
              <tbody>
                {st.map((s) => (
                  <tr key={s.id}>
                    <td>{s.stavka}</td>
                    <td className="muted">{nazivOsnovice(r, s.osnovica)}</td>
                    <td className="br">
                      {s.osnovica === 'pdv' ? `${broj(s.cijena * 100, 0)} %` : cijena(s.cijena)}
                      {s.cijenaIznadPraga !== undefined && <span className="muted"> / iznad praga {cijena(s.cijenaIznadPraga)}</span>}
                    </td>
                    <td className="muted mali">{s.osnovica !== 'pdv' && (s.uPdv ? 's PDV-om' : 'bez PDV-a')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {razdoblja.length > 1 && (
        <button className="tekst-gumb" onClick={() => setSve(!sve)}>{sve ? 'Samo trenutni' : `Povijest cijena (${razdoblja.length})`}</button>
      )}
      {uredi && <UrediCjenik r={r} od={uredi === 'novi' ? undefined : uredi} zatvori={() => setUredi(null)} />}
    </Kartica>
  );
}
