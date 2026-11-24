import { useMemo, useState } from 'react';
import { planiraniOdvozi, propusteniOdvoz, rasporediZa, serijaBrojila, sljedeciOdvoz, type PlaniraniOdvoz } from '../domain/calc';
import { danas, danUTjednuInstr, dodajMjesece, eur, imeDana, mjesec, nazivMjeseca, prikazDatuma, radniDan, blagdan } from '../domain/dates';
import type { Ocitanje, Podaci, Raspored, Rezija } from '../domain/types';
import { noviId, useStanje } from '../state';
import { BrojUnos, Kartica, Modal, Oznaka, Polje } from './common';

export const opisOdvoza = (x: PlaniraniOdvoz) =>
  `${imeDana(x.datum)} ${prikazDatuma(x.datum)}${x.pomak ? ` (umjesto ${prikazDatuma(x.planirano)}: ${x.pomak})` : ''}`;

export const opisRasporeda = (r: Raspored) =>
  `${danUTjednuInstr(r.prviOdvoz)}${r.svakihTjedana > 1 ? `, svaka ${r.svakihTjedana} tjedna` : ', svaki tjedan'}`;

const odvoziMjeseca = (p: Podaci, rezijaId: string, m: string) =>
  p.ocitanja.filter((x) => x.rezijaId === rezijaId && (x.vrsta === 'odvoz' || x.vrsta === 'odvozi') && mjesec(x.datum) === m);

/** Upis jednog odvoza smeća. Broj odvoza u mjesecu plaća se idući mjesec. */
export function OdvozForma(props: { rezijaId: string; pocetno?: Ocitanje; zatvori: () => void }) {
  const { podaci, izmijeni, sada } = useStanje();
  const r = podaci.rezije.find((x) => x.id === props.rezijaId)!;
  const [o, setO] = useState<Partial<Ocitanje>>(() => props.pocetno ?? { datum: propusteniOdvoz(podaci, r.id, danas())?.datum ?? danas() });
  const vecUpisan = podaci.ocitanja.some((x) => x.rezijaId === r.id && x.vrsta === 'odvoz' && x.datum === o.datum && x.id !== o.id);
  const ok = !!o.datum && !vecUpisan;
  const m = o.datum ? mjesec(o.datum) : sada;

  const zapis = (): Ocitanje => ({ id: o.id ?? noviId('o'), rezijaId: r.id, datum: o.datum!, vrsta: 'odvoz', vrijednost: 1, napomena: o.napomena?.trim() || undefined });
  const pregled = useMemo(() => {
    if (!ok) return undefined;
    const z = zapis();
    const p2: Podaci = { ...podaci, ocitanja: [...podaci.ocitanja.filter((x) => x.id !== z.id), z] };
    const upisano = odvoziMjeseca(p2, r.id, m).reduce((a, x) => a + (x.vrsta === 'odvoz' ? 1 : x.vrijednost), 0);
    const e = serijaBrojila(p2, r, { sada, unaprijed: 1 }).find((x) => x.mjesec === m);
    return { upisano, e };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, podaci]);

  const spremi = async () => {
    if (!ok) return;
    const z = zapis();
    props.zatvori();
    await izmijeni((d) => ({ ...d, ocitanja: [...d.ocitanja.filter((x) => x.id !== z.id), z].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)) }));
  };
  const obrisi = async () => {
    if (!o.id || !confirm('Obrisati ovaj odvoz?')) return;
    props.zatvori();
    await izmijeni((d) => ({ ...d, ocitanja: d.ocitanja.filter((x) => x.id !== o.id) }));
  };

  const neradni = o.datum && !radniDan(o.datum) ? blagdan(o.datum) ?? 'vikend' : undefined;
  return (
    <Modal naslov={props.pocetno ? `${r.naziv}: odvoz` : `${r.naziv}: novi odvoz`} zatvori={props.zatvori}>
      <div className="forma">
        <Polje oznaka="Datum odvoza" pomoc={o.datum ? imeDana(o.datum) : undefined}>
          <input type="date" autoFocus value={o.datum ?? ''} onChange={(e) => setO({ ...o, datum: e.target.value })} />
        </Polje>
        <Polje oznaka="Napomena">
          <input value={o.napomena ?? ''} onChange={(e) => setO({ ...o, napomena: e.target.value })} />
        </Polje>
      </div>
      {vecUpisan && <p className="greska-tekst">Odvoz na ovaj datum je već upisan.</p>}
      {neradni && <p className="biljeska">Taj dan je neradni ({neradni}).</p>}
      {pregled && (
        <div className="izracun">
          <div>
            <span className="muted">{nazivMjeseca(m)}</span>
            <b>
              {pregled.upisano} {pregled.upisano === 1 ? 'odvoz' : pregled.upisano < 5 ? 'odvoza' : 'odvoza'} upisano
            </b>
            {pregled.e?.izvor === 'procjena' && <span className="muted">po rasporedu do kraja mjeseca ukupno {pregled.e.kolicina}</span>}
          </div>
          {pregled.e?.racun !== undefined && (
            <div>
              <span className="muted">Račun u {nazivMjeseca(dodajMjesece(m, 1))}</span>
              <b>{pregled.e.izvor === 'procjena' ? '~' : ''}{eur(pregled.e.zaPlatiti)}</b>
            </div>
          )}
        </div>
      )}
      <footer className="modal-podnozje">
        {props.pocetno && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" disabled={!ok} onClick={spremi}>Spremi</button>
      </footer>
    </Modal>
  );
}

function RasporedForma(props: { r: Rezija; pocetno: Partial<Raspored>; zatvori: () => void }) {
  const { izmijeni } = useStanje();
  const [u, setU] = useState(props.pocetno);
  const ok = !!u.prviOdvoz && (u.svakihTjedana ?? 0) >= 1;
  const spremi = async () => {
    if (!ok) return;
    const z: Raspored = { id: u.id ?? noviId('ra'), rezijaId: props.r.id, prviOdvoz: u.prviOdvoz!, svakihTjedana: u.svakihTjedana!, napomena: u.napomena?.trim() || undefined };
    props.zatvori();
    await izmijeni((d) => ({ ...d, rasporedi: [...d.rasporedi.filter((x) => x.id !== z.id), z] }));
  };
  const obrisi = async () => {
    props.zatvori();
    await izmijeni((d) => ({ ...d, rasporedi: d.rasporedi.filter((x) => x.id !== u.id) }));
  };
  return (
    <Modal naslov={u.id ? 'Raspored odvoza' : 'Novi raspored odvoza'} zatvori={props.zatvori}>
      <div className="forma">
        <Polje oznaka="Prvi odvoz po ovom rasporedu" pomoc={u.prviOdvoz ? `${imeDana(u.prviOdvoz)} — odvoz je ${danUTjednuInstr(u.prviOdvoz)}` : 'određuje i dan u tjednu'}>
          <input type="date" value={u.prviOdvoz ?? ''} onChange={(e) => setU({ ...u, prviOdvoz: e.target.value })} />
        </Polje>
        <Polje oznaka="Svakih koliko tjedana">
          <BrojUnos vrijednost={u.svakihTjedana} promjena={(v) => setU({ ...u, svakihTjedana: v })} />
        </Polje>
        <Polje oznaka="Napomena" siroko>
          <input value={u.napomena ?? ''} onChange={(e) => setU({ ...u, napomena: e.target.value })} />
        </Polje>
      </div>
      <p className="biljeska">Ako je dan odvoza blagdan ili neradni dan, odvoz se računa sljedeći radni dan. Stari raspored vrijedi do prvog odvoza po novom.</p>
      <footer className="modal-podnozje">
        {u.id && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" disabled={!ok} onClick={spremi}>Spremi</button>
      </footer>
    </Modal>
  );
}

/** Pločice i kartice na stranici smeća. */
export function OdvoziPlocice(props: { r: Rezija; dodaj: () => void }) {
  const { podaci, sada, serije } = useStanje();
  const { r } = props;
  const sljedeci = sljedeciOdvoz(podaci, r.id, danas());
  const e = serije.get(r.id)?.find((x) => x.mjesec === sada);
  const doSada = e?.doSada ?? (e?.izvor === 'ocitanje' ? e.kolicina : 0);
  return (
    <>
      <button className="plocica klik istaknuta" onClick={props.dodaj}>
        <span className="plocica-naslov">Dodaj odvoz</span>
        <span className="plocica-broj">+</span>
        <span className="plocica-opis">{nazivMjeseca(sada)}: upisano {doSada}</span>
      </button>
      <div className="plocica">
        <span className="plocica-naslov">Sljedeći odvoz</span>
        <span className="plocica-broj">{sljedeci ? <>{imeDana(sljedeci.datum)} <small>{prikazDatuma(sljedeci.datum)}</small></> : '–'}</span>
        <span className="plocica-opis">
          {sljedeci?.pomak ? <Oznaka vrsta="upozorenje">pomaknut: {sljedeci.pomak}</Oznaka> : sljedeci ? 'po rasporedu' : 'upiši raspored odvoza'}
        </span>
      </div>
      {e && e.racun !== undefined && (
        <div className="plocica">
          <span className="plocica-naslov">{nazivMjeseca(sada)} · {e.izvor === 'procjena' ? 'procjena' : 'upisano'}</span>
          <span className="plocica-broj">{eur(e.zaPlatiti)}</span>
          <span className="plocica-opis">
            {e.kolicina} odvoza{e.izvor === 'procjena' ? ` (do sada ${doSada})` : ''} · plaća se {nazivMjeseca(dodajMjesece(sada, 1))}
          </span>
        </div>
      )}
    </>
  );
}

export function OdvoziKartice(props: { r: Rezija }) {
  const { podaci, sada } = useStanje();
  const { r } = props;
  const [uredi, setUredi] = useState<Ocitanje | null>(null);
  const [raspored, setRaspored] = useState<Partial<Raspored> | null>(null);
  const rasporedi = rasporediZa(podaci, r.id);
  const trenutni = rasporedi.filter((x) => x.prviOdvoz <= danas()).pop();
  const odvozi = podaci.ocitanja
    .filter((x) => x.rezijaId === r.id && x.vrsta === 'odvoz' && mjesec(x.datum) >= dodajMjesece(sada, -1))
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));
  const planirani = planiraniOdvozi(podaci, r.id, danas(), `${dodajMjesece(sada, 1)}-31`).filter((x) => x.datum > danas()).slice(0, 4);
  return (
    <div className="dva-stupca">
      <Kartica naslov="Odvozi" akcije={<span className="muted mali">ovaj i prošli mjesec</span>}>
        {!odvozi.length && <p className="muted">Još nema upisanih odvoza. Svaki odvoz upiši gumbom "Dodaj odvoz".</p>}
        {odvozi.map((x) => (
          <div key={x.id} className="red-stavka klik" onClick={() => setUredi(x)}>
            <span>{prikazDatuma(x.datum)}</span>
            <span className="rasteg muted">{imeDana(x.datum)}{x.napomena ? ` · ${x.napomena}` : ''}</span>
            <span className="muted mali">{nazivMjeseca(mjesec(x.datum))}</span>
          </div>
        ))}
        {planirani.length > 0 && (
          <>
            <p className="oznaka" style={{ marginTop: 12 }}>Sljedeći po rasporedu</p>
            {planirani.map((x) => (
              <div key={x.datum} className="red-stavka">
                <span className="muted">{prikazDatuma(x.datum)}</span>
                <span className="rasteg muted">{imeDana(x.datum)}</span>
                {x.pomak && <Oznaka vrsta="upozorenje">{x.pomak}</Oznaka>}
              </div>
            ))}
          </>
        )}
      </Kartica>
      <Kartica
        naslov="Raspored odvoza"
        akcije={<button onClick={() => setRaspored({ prviOdvoz: sljedeciOdvoz(podaci, r.id, danas())?.planirano ?? danas(), svakihTjedana: trenutni?.svakihTjedana ?? 1 })}>{rasporedi.length ? 'Promijeni dan' : '+ Raspored'}</button>}
      >
        {!rasporedi.length && <p className="muted">Upiši dan odvoza (npr. srijedom) da aplikacija pokaže sljedeći odvoz i procijeni broj odvoza u mjesecu.</p>}
        {[...rasporedi].reverse().map((x) => (
          <div key={x.id} className="red-stavka klik" onClick={() => setRaspored(x)}>
            <span>{opisRasporeda(x)}</span>
            <span className="rasteg muted">od {prikazDatuma(x.prviOdvoz)}{x.napomena ? ` · ${x.napomena}` : ''}</span>
            {x === trenutni ? <Oznaka vrsta="placeno">vrijedi</Oznaka> : x.prviOdvoz > danas() ? <Oznaka vrsta="neutralno">od {prikazDatuma(x.prviOdvoz)}</Oznaka> : null}
          </div>
        ))}
        <p className="biljeska">Kad je dan odvoza blagdan ili vikend, odvoz se pomiče na sljedeći radni dan (hrvatski blagdani, uključujući Uskrs i Tijelovo).</p>
      </Kartica>
      {uredi && <OdvozForma rezijaId={r.id} pocetno={uredi} zatvori={() => setUredi(null)} />}
      {raspored && <RasporedForma r={r} pocetno={raspored} zatvori={() => setRaspored(null)} />}
    </div>
  );
}
