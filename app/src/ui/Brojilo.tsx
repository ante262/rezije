import { useMemo, useState } from 'react';
import { prijavaZa, prozorOcitanja, rokOcitanja, serijaBrojila, trenutniPrag, type MjesecPotrosnje } from '../domain/calc';
import { broj, brojMjeseca, danas, dodajMjesece, eur, godina, mjesec, nazivMjeseca, prikazDatuma } from '../domain/dates';
import type { Ocitanje, Podaci, Rezija } from '../domain/types';
import { noviId, useStanje } from '../state';
import { BrojUnos, Kartica, Modal, Oznaka, Polje } from './common';
import { GodisnjiGraf } from './Grafovi';
import { OdvozForma, OdvoziKartice, OdvoziPlocice } from './Odvoz';
import { Podsjetnici } from './Podsjetnici';
import { PlacanjeForma } from './Placanja';

const jedinica = (r: Rezija) => (r.vrsta === 'struja' ? 'kWh' : r.vrsta === 'smece' ? 'odvoza' : 'm³');

function zadnjeOcitanje(p: Podaci, rezijaId: string): Ocitanje | undefined {
  return p.ocitanja
    .filter((o) => o.rezijaId === rezijaId && o.vrsta === 'ocitanje')
    .sort((a, b) => (a.datum < b.datum ? -1 : 1))
    .pop();
}

/**
 * Unos očitanja (struja: VT/NT, voda: stanje, smeće: broj odvoza).
 * Odmah pokazuje procijenjenu potrošnju i iznos računa.
 */
export function OcitanjeForma(props: { rezijaId: string; pocetno?: Ocitanje; zatvori: () => void }) {
  const { podaci, izmijeni, sada } = useStanje();
  const r = podaci.rezije.find((x) => x.id === props.rezijaId)!;
  const smece = r.vrsta === 'smece';
  const zadnje = zadnjeOcitanje(podaci, r.id);
  const [o, setO] = useState<Partial<Ocitanje>>(
    props.pocetno ?? { datum: smece ? `${dodajMjesece(sada, -1)}-01` : danas(), vrsta: smece ? 'odvozi' : 'ocitanje' },
  );
  const [zamjena, setZamjena] = useState(false);
  const rok = smece ? undefined : rokOcitanja(r);
  const prozor = rok && o.datum ? prozorOcitanja(rok, mjesec(o.datum)) : undefined;
  const izvanRoka = prozor && o.datum && (o.datum < prozor.od || o.datum > prozor.do);
  const [staroVt, setStaroVt] = useState<number | undefined>();
  const [staroNt, setStaroNt] = useState<number | undefined>();

  const zapisi = (): Ocitanje[] => {
    const out: Ocitanje[] = [];
    if (zamjena && staroVt !== undefined)
      out.push({ id: noviId('o'), rezijaId: r.id, datum: o.datum!, vrsta: 'zamjena', vrijednost: staroVt, nt: staroNt, napomena: 'zamjena brojila – završno stanje starog' });
    out.push({
      id: o.id ?? noviId('o'), rezijaId: r.id, datum: o.datum!, vrsta: o.vrsta ?? 'ocitanje',
      vrijednost: o.vrijednost!, nt: r.vrsta === 'struja' ? o.nt : undefined,
      prijavljeno: !smece && o.prijavljeno ? true : undefined, napomena: o.napomena?.trim() || undefined,
    });
    return out;
  };
  const ok = o.datum && o.vrijednost !== undefined && (r.vrsta !== 'struja' || o.nt !== undefined);

  // u mjesecu vrijedi jedno očitanje: novo zamjenjuje postojeće za taj mjesec (smeće: broj odvoza za mjesec)
  const vrstaZapisa = o.vrsta ?? 'ocitanje';
  const zamjenjuje = o.datum
    ? podaci.ocitanja.filter(
        (x) => x.rezijaId === r.id && x.id !== o.id && x.vrsta === vrstaZapisa && (vrstaZapisa === 'ocitanje' || vrstaZapisa === 'odvozi') && mjesec(x.datum) === mjesec(o.datum!),
      )
    : [];
  const ukloni = new Set(zamjenjuje.map((x) => x.id));

  // pregled izračuna s novim očitanjem
  const pregled = useMemo(() => {
    if (!ok) return undefined;
    const novi = zapisi();
    const ids = new Set(novi.map((x) => x.id));
    const p2: Podaci = {
      ...podaci,
      ocitanja: [
        ...podaci.ocitanja.filter((x) => !ids.has(x.id) && !ukloni.has(x.id)),
        ...novi,
      ],
    };
    return serijaBrojila(p2, r, { sada, unaprijed: 0 }).find((x) => x.mjesec === mjesec(o.datum!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, zamjena, staroVt, staroNt, podaci]);

  const spremi = async () => {
    if (!ok) return;
    const novi = zapisi();
    props.zatvori();
    await izmijeni((d) => ({
      ...d,
      ocitanja: [
        ...d.ocitanja.filter((x) => x.id !== o.id && !ukloni.has(x.id)),
        ...novi,
      ].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)),
    }));
  };
  const obrisi = async () => {
    if (!o.id || !confirm('Obrisati ovo očitanje?')) return;
    props.zatvori();
    await izmijeni((d) => ({ ...d, ocitanja: d.ocitanja.filter((x) => x.id !== o.id) }));
  };

  return (
    <Modal naslov={smece ? `${r.naziv}: broj odvoza` : `${r.naziv}: očitanje brojila`} zatvori={props.zatvori}>
      <div className="forma">
        {smece ? (
          <>
            <Polje oznaka="Mjesec">
              <input type="month" value={o.datum?.slice(0, 7) ?? ''} onChange={(e) => setO({ ...o, datum: `${e.target.value}-01` })} />
            </Polje>
            <Polje oznaka="Broj odvoza">
              <BrojUnos velik autoFocus vrijednost={o.vrijednost} promjena={(v) => setO({ ...o, vrijednost: v })} />
            </Polje>
          </>
        ) : (
          <>
            <Polje oznaka="Datum očitanja" siroko>
              <input type="date" value={o.datum ?? ''} onChange={(e) => setO({ ...o, datum: e.target.value })} />
            </Polje>
            <Polje oznaka={r.vrsta === 'struja' ? 'Visoka tarifa (VT)' : 'Stanje brojila'} pomoc={zadnje && `zadnje: ${broj(zadnje.vrijednost)} (${prikazDatuma(zadnje.datum)})`}>
              <BrojUnos velik autoFocus vrijednost={o.vrijednost} promjena={(v) => setO({ ...o, vrijednost: v })} />
            </Polje>
            {r.vrsta === 'struja' && (
              <Polje oznaka="Niska tarifa (NT)" pomoc={zadnje?.nt !== undefined && `zadnje: ${broj(zadnje.nt)}`}>
                <BrojUnos velik vrijednost={o.nt} promjena={(v) => setO({ ...o, nt: v })} />
              </Polje>
            )}
            {rok && (
              <label className="kvacica siroko">
                <input type="checkbox" checked={!!o.prijavljeno} onChange={(e) => setO({ ...o, prijavljeno: e.target.checked })} /> Prijavljeno ({prijavaZa(r)})
              </label>
            )}
            {!props.pocetno && (
              <label className="kvacica siroko">
                <input type="checkbox" checked={zamjena} onChange={(e) => setZamjena(e.target.checked)} /> Zamijenjeno je brojilo
              </label>
            )}
            {zamjena && (
              <>
                <Polje oznaka={r.vrsta === 'struja' ? 'Završno stanje starog (VT)' : 'Završno stanje starog brojila'}>
                  <BrojUnos vrijednost={staroVt} promjena={setStaroVt} />
                </Polje>
                {r.vrsta === 'struja' && (
                  <Polje oznaka="Završno stanje starog (NT)">
                    <BrojUnos vrijednost={staroNt} promjena={setStaroNt} />
                  </Polje>
                )}
              </>
            )}
          </>
        )}
        <Polje oznaka="Napomena" siroko>
          <input value={o.napomena ?? ''} onChange={(e) => setO({ ...o, napomena: e.target.value })} />
        </Polje>
      </div>
      {prozor && (
        <p className={izvanRoka ? 'biljeska upozorenje-tekst' : 'biljeska'}>
          Rok za očitanje i prijavu ({prijavaZa(r)}): {Number(prozor.od.slice(8))}.–{prikazDatuma(prozor.do)}
          {izvanRoka ? ' — ovo očitanje je izvan roka, pa ga podsjetnik neće računati kao prijavljeno.' : ''}
        </p>
      )}
      {zamjenjuje.length > 0 && (
        <p className="biljeska">
          Zamjenjuje {smece ? 'upisani broj odvoza' : 'očitanje'} za {nazivMjeseca(mjesec(o.datum!))}:{' '}
          {zamjenjuje
            .map((x) => (smece ? broj(x.vrijednost) : `${prikazDatuma(x.datum)} ${r.vrsta === 'struja' ? `VT ${broj(x.vrijednost)}, NT ${broj(x.nt ?? 0)}` : broj(x.vrijednost)}`))
            .join('; ')}
          . U mjesecu se pamti samo zadnje {smece ? 'upisano stanje' : 'očitanje'}
          {r.vrsta === 'struja' ? ' i iz njega se procjenjuje potrošnja do kraja mjeseca' : ''}.
        </p>
      )}
      {pregled && pregled.izvor === 'ocitanje' && (
        <div className="izracun">
          <div>
            <span className="muted">Potrošnja za {nazivMjeseca(pregled.mjesec)}</span>
            <b>
              {r.vrsta === 'struja'
                ? `VT ${broj(pregled.vt)} + NT ${broj(pregled.nt)} = ${broj(pregled.vt + pregled.nt)} kWh`
                : `${broj(pregled.kolicina, r.vrsta === 'voda' ? 0 : 0)} ${jedinica(r)}`}
            </b>
            {r.vrsta === 'struja' && o.datum && Number(o.datum.slice(8)) < 28 && (
              <span className="muted">procjena do kraja mjeseca iz očitanja {o.datum.slice(8)}. u mjesecu</span>
            )}
          </div>
          {pregled.racun !== undefined && (
            <div>
              <span className="muted">Račun</span>
              <b>{eur(pregled.racun)}</b>
              {pregled.vauceri > 0 && <span className="muted">za platiti {eur(pregled.zaPlatiti)} (uz vaučer)</span>}
            </div>
          )}
          {pregled.prag && pregled.prag.visak > 0 && (
            <div>
              <Oznaka vrsta="upozorenje">prag</Oznaka>
              <span className="muted">
                {broj(pregled.prag.ukupno)} kWh u razdoblju, {broj(pregled.prag.visak)} kWh iznad praga
              </span>
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

/** Ručna procjena potrošnje za budući mjesec. */
function ProcjenaForma(props: { r: Rezija; e: MjesecPotrosnje; zatvori: () => void }) {
  const { izmijeni } = useStanje();
  const { r, e } = props;
  const [vt, setVt] = useState<number | undefined>(r.vrsta === 'struja' ? e.vt : e.kolicina);
  const [nt, setNt] = useState<number | undefined>(e.nt);
  const postojeca = e.izvor === 'rucna-procjena' ? e.ocitanje : undefined;
  const spremi = async (brisi = false) => {
    props.zatvori();
    await izmijeni((d) => {
      const ostala = d.ocitanja.filter((x) => !(x.rezijaId === r.id && x.vrsta === 'procjena' && mjesec(x.datum) === e.mjesec));
      if (brisi || vt === undefined) return { ...d, ocitanja: ostala };
      return {
        ...d,
        ocitanja: [...ostala, { id: postojeca?.id ?? noviId('o'), rezijaId: r.id, datum: `${e.mjesec}-01`, vrsta: 'procjena', vrijednost: vt, nt: r.vrsta === 'struja' ? nt ?? 0 : undefined }],
      };
    });
  };
  return (
    <Modal naslov={`Procjena za ${nazivMjeseca(e.mjesec)}`} zatvori={props.zatvori}>
      <p className="muted">
        Automatska procjena uzima potrošnju iz istog mjeseca prošle godine. Ovdje je možeš ručno ispraviti.
      </p>
      <div className="forma">
        <Polje oznaka={r.vrsta === 'struja' ? 'VT (kWh)' : `Potrošnja (${jedinica(r)})`}>
          <BrojUnos autoFocus vrijednost={vt} promjena={setVt} />
        </Polje>
        {r.vrsta === 'struja' && (
          <Polje oznaka="NT (kWh)">
            <BrojUnos vrijednost={nt} promjena={setNt} />
          </Polje>
        )}
      </div>
      <footer className="modal-podnozje">
        {postojeca && <button onClick={() => spremi(true)}>Vrati automatsku</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" onClick={() => spremi()}>Spremi</button>
      </footer>
    </Modal>
  );
}

export function BrojiloStranica(props: { r: Rezija }) {
  const { podaci, sada, serije } = useStanje();
  const { r } = props;
  const serija = useMemo(() => serije.get(r.id) ?? [], [serije, r.id]);
  const [ocitanje, setOcitanje] = useState<Ocitanje | 'novo' | null>(null);
  const [procjena, setProcjena] = useState<MjesecPotrosnje | null>(null);
  const [placanje, setPlacanje] = useState<MjesecPotrosnje | null>(null);
  const [sve, setSve] = useState(false);
  const [odvoz, setOdvoz] = useState(false);
  const prag = r.vrsta === 'struja' ? trenutniPrag(podaci, serija, sada) : undefined;
  const sljedeci = serija.find((x) => x.mjesec === dodajMjesece(sada, 0)) ;
  const zadnje = zadnjeOcitanje(podaci, r.id);

  // godišnja usporedba: račun po mjesecu potrošnje
  const godisnje = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const e of serija) {
      if (e.racun === undefined || e.izvor !== 'ocitanje') continue;
      if (!m.has(godina(e.mjesec))) m.set(godina(e.mjesec), new Map());
      m.get(godina(e.mjesec))!.set(brojMjeseca(e.mjesec), e.racun);
    }
    return m;
  }, [serija]);
  const godisnjaPotrosnja = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const e of serija) {
      if (e.izvor !== 'ocitanje') continue;
      if (!m.has(godina(e.mjesec))) m.set(godina(e.mjesec), new Map());
      m.get(godina(e.mjesec))!.set(brojMjeseca(e.mjesec), r.vrsta === 'struja' ? e.vt + e.nt : e.kolicina);
    }
    return m;
  }, [serija, r.vrsta]);
  const [prikazGrafa, setPrikazGrafa] = useState<'racun' | 'potrosnja'>('racun');

  const redovi = [...serija].reverse().filter((e) => e.izvor !== 'nema' || e.placanje);
  // zadano: godinu unatrag i do godinu unaprijed
  const prikaz = sve ? redovi : redovi.filter((e) => e.mjesec >= dodajMjesece(sada, -12) && e.mjesec <= dodajMjesece(sada, 12));
  const zaNovoPlacanje = placanje
    ? {
        rezijaId: r.id,
        datum: danas(),
        zaMjesec: placanje.mjesec,
        racun: placanje.racun,
        vauceri: placanje.vauceri || undefined,
        iznos: placanje.zaPlatiti,
        naknada: podaci.placanja.filter((x) => x.rezijaId === r.id).pop()?.naknada,
      }
    : null;

  const smece = r.vrsta === 'smece';
  return (
    <>
      <Podsjetnici rezijaId={r.id} />
      <div className="plocice">
        {smece ? (
          <OdvoziPlocice r={r} dodaj={() => setOdvoz(true)} />
        ) : (
        <button className="plocica klik istaknuta" onClick={() => setOcitanje('novo')}>
          <span className="plocica-naslov">{r.vrsta === 'smece' ? 'Upiši broj odvoza' : 'Novo očitanje'}</span>
          <span className="plocica-broj">+</span>
          <span className="plocica-opis">
            {zadnje ? `zadnje ${prikazDatuma(zadnje.datum)}: ${broj(zadnje.vrijednost)}${zadnje.nt !== undefined ? ` / ${broj(zadnje.nt)}` : ''}` : 'još nema očitanja'}
          </span>
        </button>
        )}
        {!smece && sljedeci && sljedeci.racun !== undefined && (
          <div className="plocica">
            <span className="plocica-naslov">{nazivMjeseca(sljedeci.mjesec)} · {sljedeci.izvor === 'ocitanje' ? 'iz očitanja' : 'procjena'}</span>
            <span className="plocica-broj">{eur(sljedeci.zaPlatiti)}</span>
            <span className="plocica-opis">
              račun {eur(sljedeci.racun)}
              {r.vrsta === 'struja' ? ` · ${broj(sljedeci.vt)} + ${broj(sljedeci.nt)} kWh` : ` · ${broj(sljedeci.kolicina)} ${jedinica(r)}`}
            </span>
          </div>
        )}
        {prag && (
          <div className="plocica">
            <span className="plocica-naslov">Razdoblje {nazivMjeseca(prag.od).split(' ')[0]} – {nazivMjeseca(prag.do)}</span>
            <span className="plocica-broj">
              {broj(prag.stvarno)} <small>/ {broj(prag.prag)} kWh</small>
            </span>
            <span className="plocica-opis">
              procjena do kraja razdoblja {broj(prag.procjena)} kWh
              {prag.procjena > prag.prag && <> · <Oznaka vrsta="upozorenje">~{broj(prag.procjena - prag.prag)} kWh iznad</Oznaka></>}
            </span>
            <span className="traka" aria-hidden>
              <span style={{ width: `${Math.min(100, (prag.stvarno / prag.prag) * 100)}%` }} />
              <span className="procjena" style={{ width: `${Math.max(0, Math.min(100, ((prag.procjena - prag.stvarno) / prag.prag) * 100))}%` }} />
            </span>
          </div>
        )}
      </div>

      {smece && <OdvoziKartice r={r} />}

      <Kartica
        naslov="Usporedba po godinama"
        akcije={
          <div className="segment">
            <button className={prikazGrafa === 'racun' ? 'aktivno' : ''} onClick={() => setPrikazGrafa('racun')}>Račun (€)</button>
            <button className={prikazGrafa === 'potrosnja' ? 'aktivno' : ''} onClick={() => setPrikazGrafa('potrosnja')}>Potrošnja ({jedinica(r)})</button>
          </div>
        }
      >
        {prikazGrafa === 'racun' ? (
          <GodisnjiGraf podaci={godisnje} />
        ) : (
          <GodisnjiGraf podaci={godisnjaPotrosnja} jedinica={(v) => `${broj(v)} ${jedinica(r)}`} />
        )}
        <p className="biljeska">Po mjesecu potrošnje, samo mjeseci s očitanjem. Procjene su u tablici ispod.</p>
      </Kartica>

      <Kartica naslov="Po mjesecima">
        <div className="tablica-omot">
          <table className="tablica">
            <thead>
              <tr>
                <th>Mjesec</th>
                <th className="sakrij-mob">Očitanje</th>
                {r.vrsta === 'struja' ? (
                  <>
                    <th className="br">VT</th>
                    <th className="br">NT</th>
                  </>
                ) : (
                  <th className="br">{r.vrsta === 'smece' ? 'Odvoza' : 'm³'}</th>
                )}
                <th className="br">Račun</th>
                <th className="br">Plaćeno</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prikaz.map((e) => {
                const buduci = e.izvor === 'procjena' || e.izvor === 'rucna-procjena';
                return (
                  <tr key={e.mjesec} className={buduci ? 'procjena-red' : ''}>
                    <td>
                      {nazivMjeseca(e.mjesec)}
                      {e.prag && e.prag.visak > 0 && <span className="muted mali"> · {broj(e.prag.visak)} kWh iznad praga</span>}
                    </td>
                    <td className="muted sakrij-mob">
                      {e.izvor === 'ocitanje' && e.ocitanje && r.vrsta !== 'smece' && (
                        <button className="tekst-gumb" onClick={() => setOcitanje(e.ocitanje!)}>
                          {prikazDatuma(e.ocitanje.datum)}
                        </button>
                      )}
                      {e.ocitanje?.prijavljeno && r.vrsta !== 'smece' && <span className="muted mali" title={`prijavljeno (${prijavaZa(r)})`}> ✓ prijavljeno</span>}
                      {e.izvor === 'procjena' && <Oznaka vrsta="procjena">procjena</Oznaka>}
                      {e.izvor === 'rucna-procjena' && <Oznaka vrsta="procjena">ručna procjena</Oznaka>}
                    </td>
                    {r.vrsta === 'struja' ? (
                      <>
                        <td className="br">{e.izvor !== 'nema' ? broj(e.vt) : ''}</td>
                        <td className="br">{e.izvor !== 'nema' ? broj(e.nt) : ''}</td>
                      </>
                    ) : (
                      <td className="br">
                        {e.doSada !== undefined && e.doSada !== e.kolicina && <span className="muted mali">{e.doSada} / </span>}
                        {e.izvor !== 'nema' ? broj(e.kolicina, r.vrsta === 'voda' && e.kolicina % 1 ? 1 : 0) : ''}
                      </td>
                    )}
                    <td className="br">{e.racun !== undefined ? eur(e.racun) : ''}</td>
                    <td className="br">
                      {e.placanje ? (
                        <>
                          {eur(e.placanje.iznos)}
                          {e.vauceri > 0 && <span className="muted mali"> vaučer</span>}
                        </>
                      ) : e.zaPlatiti !== undefined ? (
                        <span className="muted">~{eur(e.zaPlatiti)}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="br">
                      {buduci && <button className="malo" onClick={() => setProcjena(e)}>Ispravi</button>}
                      {!buduci && !e.placanje && e.racun !== undefined && e.mjesec < sada && (
                        <button className="malo" onClick={() => setPlacanje(e)}>Plati</button>
                      )}
                      {!buduci && !e.placanje && e.mjesec === sada && e.izvor === 'ocitanje' && e.ocitanje?.vrsta === 'odvozi' && (
                        <button className="malo" onClick={() => setOcitanje(e.ocitanje!)}>Uredi</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(sve || redovi.length > prikaz.length) && <button className="tekst-gumb" onClick={() => setSve(!sve)}>{sve ? 'Prikaži manje' : `Prikaži sve (${redovi.length})`}</button>}
      </Kartica>

      {ocitanje && <OcitanjeForma rezijaId={r.id} pocetno={ocitanje === 'novo' ? undefined : ocitanje} zatvori={() => setOcitanje(null)} />}
      {odvoz && <OdvozForma rezijaId={r.id} zatvori={() => setOdvoz(false)} />}
      {procjena && <ProcjenaForma r={r} e={procjena} zatvori={() => setProcjena(null)} />}
      {zaNovoPlacanje && <PlacanjeForma pocetno={zaNovoPlacanje} zatvori={() => setPlacanje(null)} />}
    </>
  );
}
