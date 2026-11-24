import { useMemo, useState } from 'react';
import { imaPlatitelje, otvorenPlan, planOtplate, prijavaZa, rokOcitanja, rokUTekst, rataZa, stanjeOtplate } from '../domain/calc';
import { brojMjeseca, danas, dodajMjesece, eur, godina, mjesec, nazivMjeseca, prikazDatuma, round2 } from '../domain/dates';
import { VRSTE, type PromjenaRate, type Rezija, type Vaucer, type Vrsta } from '../domain/types';
import { noviId, useStanje } from '../state';
import { BrojUnos, Kartica, Modal, Oznaka, PlatiteljOdabir, Polje } from './common';
import { BrojiloStranica } from './Brojilo';
import { CjenikKartica } from './Cjenik';
import { GodisnjiGraf } from './Grafovi';
import { PlacanjeForma, PopisPlacanja } from './Placanja';
import type { Ruta } from '../App';

const nazivVrste = (v: Vrsta) => VRSTE.find((x) => x.id === v)?.naziv ?? v;
const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function RezijaForma(props: { pocetno?: Rezija; vrsta?: Vrsta; zatvori: () => void; nakon?: (id: string) => void }) {
  const { podaci, izmijeni } = useStanje();
  const novo = !props.pocetno;
  const [r, setR] = useState<Partial<Rezija>>(
    props.pocetno ?? {
      vrsta: props.vrsta ?? 'jednostavna',
      aktivna: true,
      grupa: props.vrsta === 'obrok' ? 'Obroci' : props.vrsta === 'kredit' ? 'Krediti' : props.vrsta === 'jednokratno' ? 'Jednokratno' : 'Režije',
    },
  );
  const [krajPo, setKrajPo] = useState<'broj' | 'datum'>(props.pocetno?.zadnjaRata && !props.pocetno?.brojRata ? 'datum' : 'broj');
  const plan = r.vrsta === 'obrok' || r.vrsta === 'kredit';
  const grupe = [...new Set(podaci.rezije.map((x) => x.grupa))];
  const ok = r.naziv?.trim() && r.vrsta && (!plan || (r.iznosRate && r.prvaRata));

  const spremi = async () => {
    if (!ok) return;
    let id = r.id;
    if (!id) {
      id = slug(r.naziv!) || noviId('r');
      while (podaci.rezije.some((x) => x.id === id)) id = `${id}-${noviId('').slice(0, 3)}`;
    }
    const zapis: Rezija = {
      id,
      naziv: r.naziv!.trim(),
      vrsta: r.vrsta!,
      grupa: r.grupa?.trim() || 'Ostalo',
      aktivna: r.aktivna ?? true,
      redoslijed: r.redoslijed ?? Math.max(0, ...podaci.rezije.map((x) => x.redoslijed)) + 1,
      iznosRate: plan ? r.iznosRate : undefined,
      prvaRata: plan ? r.prvaRata : undefined,
      brojRata: plan && krajPo === 'broj' ? r.brojRata : undefined,
      zadnjaRata: plan && krajPo === 'datum' ? r.zadnjaRata : undefined,
      danPlacanja: r.danPlacanja ?? (plan && r.prvaRata ? Number(r.prvaRata.slice(8, 10)) : undefined),
      platitelj: r.platitelj || undefined,
      rokOcitanja: r.rokOcitanja?.trim() || undefined,
      prijavaKome: r.prijavaKome?.trim() || undefined,
      napomena: r.napomena?.trim() || undefined,
    };
    props.zatvori();
    await izmijeni((d) => ({ ...d, rezije: novo ? [...d.rezije, zapis] : d.rezije.map((x) => (x.id === zapis.id ? zapis : x)) }));
    props.nakon?.(zapis.id);
  };

  const brojPlacanja = podaci.placanja.filter((x) => x.rezijaId === r.id).length;
  const obrisi = async () => {
    if (!confirm(brojPlacanja ? `Obrisati "${r.naziv}" i ${brojPlacanja} plaćanja? Bolje je označiti je kao neaktivnu.` : `Obrisati "${r.naziv}"?`)) return;
    props.zatvori();
    await izmijeni((d) => ({
      ...d,
      rezije: d.rezije.filter((x) => x.id !== r.id),
      placanja: d.placanja.filter((x) => x.rezijaId !== r.id),
      ocitanja: d.ocitanja.filter((x) => x.rezijaId !== r.id),
      cjenici: d.cjenici.filter((x) => x.rezijaId !== r.id),
      vauceri: d.vauceri.filter((x) => x.rezijaId !== r.id),
      promjeneRata: d.promjeneRata.filter((x) => x.rezijaId !== r.id),
    }));
    props.nakon?.('');
  };

  const pregledPlana =
    plan && r.iznosRate && r.prvaRata
      ? planOtplate({ ...(r as Rezija), brojRata: krajPo === 'broj' ? r.brojRata : undefined, zadnjaRata: krajPo === 'datum' ? r.zadnjaRata : undefined }, podaci.promjeneRata)
      : [];
  const otvoren = plan && !(krajPo === 'broj' ? r.brojRata : r.zadnjaRata);

  return (
    <Modal naslov={novo ? (r.vrsta === 'obrok' ? 'Nova obročna otplata' : r.vrsta === 'kredit' ? 'Novi kredit' : 'Nova režija') : `Uredi: ${props.pocetno!.naziv}`} zatvori={props.zatvori}>
      <div className="forma">
        <Polje oznaka="Naziv" siroko>
          <input value={r.naziv ?? ''} autoFocus onChange={(e) => setR({ ...r, naziv: e.target.value })} />
        </Polje>
        <Polje oznaka="Vrsta" pomoc={!novo ? 'vrsta se ne mijenja nakon unosa' : undefined}>
          <select value={r.vrsta} disabled={!novo} onChange={(e) => setR({ ...r, vrsta: e.target.value as Vrsta })}>
            {VRSTE.map((v) => (
              <option key={v.id} value={v.id}>{v.naziv}</option>
            ))}
          </select>
        </Polje>
        <Polje oznaka="Grupa" pomoc="za grafove i zbrojeve">
          <input list="grupe" value={r.grupa ?? ''} onChange={(e) => setR({ ...r, grupa: e.target.value })} />
          <datalist id="grupe">{grupe.map((g) => <option key={g} value={g} />)}</datalist>
        </Polje>
        {plan && (
          <>
            <Polje oznaka="Iznos rate (€)" pomoc={!novo && podaci.promjeneRata.some((x) => x.rezijaId === r.id) ? 'početni iznos, promjene su na stranici kredita' : undefined}>
              <BrojUnos vrijednost={r.iznosRate} promjena={(v) => setR({ ...r, iznosRate: v })} />
            </Polje>
            <Polje oznaka="Prva rata">
              <input type="date" value={r.prvaRata ?? ''} onChange={(e) => setR({ ...r, prvaRata: e.target.value })} />
            </Polje>
            <Polje oznaka="Kraj otplate">
              <select value={krajPo} onChange={(e) => setKrajPo(e.target.value as 'broj' | 'datum')}>
                <option value="broj">broj rata</option>
                <option value="datum">datum zadnje rate</option>
              </select>
            </Polje>
            {krajPo === 'broj' ? (
              <Polje oznaka="Broj rata" pomoc="računajući od prve rate">
                <BrojUnos vrijednost={r.brojRata} promjena={(v) => setR({ ...r, brojRata: v })} />
              </Polje>
            ) : (
              <Polje oznaka="Zadnja rata">
                <input type="date" value={r.zadnjaRata ?? ''} onChange={(e) => setR({ ...r, zadnjaRata: e.target.value })} />
              </Polje>
            )}
          </>
        )}
        {r.vrsta !== 'jednokratno' && (
          <Polje oznaka="Dan plaćanja" pomoc="u mjesecu (neobavezno)">
            <BrojUnos vrijednost={r.danPlacanja} promjena={(v) => setR({ ...r, danPlacanja: v })} />
          </Polje>
        )}
        {(r.vrsta === 'struja' || r.vrsta === 'voda') && (
          <>
            <Polje oznaka="Rok očitanja" pomoc={'npr. "15-25" (od 15. do 25.), "zadnjih 7" (zadnjih 7 dana u mjesecu) ili "ne"'}>
              <input
                value={r.rokOcitanja ?? ''}
                placeholder={rokUTekst(rokOcitanja({ ...(r as Rezija), rokOcitanja: undefined }))}
                onChange={(e) => setR({ ...r, rokOcitanja: e.target.value })}
              />
            </Polje>
            <Polje oznaka="Prijava očitanja" pomoc="kome se prijavljuje">
              <input value={r.prijavaKome ?? ''} placeholder={prijavaZa({ ...(r as Rezija), prijavaKome: undefined })} onChange={(e) => setR({ ...r, prijavaKome: e.target.value })} />
            </Polje>
          </>
        )}
        {imaPlatitelje(podaci) && (
          <Polje oznaka="Tko plaća" pomoc="za nova plaćanja i procjene; stara plaćanja se ne mijenjaju">
            <PlatiteljOdabir vrijednost={r.platitelj} promjena={(v) => setR({ ...r, platitelj: v })} />
          </Polje>
        )}
        <label className="kvacica">
          <input type="checkbox" checked={r.aktivna ?? true} onChange={(e) => setR({ ...r, aktivna: e.target.checked })} /> Aktivna (ulazi u procjene)
        </label>
        <Polje oznaka="Napomena" siroko>
          <input value={r.napomena ?? ''} onChange={(e) => setR({ ...r, napomena: e.target.value })} />
        </Polje>
      </div>
      {plan && pregledPlana.length > 0 && (
        <p className="izracun">
          {otvoren ? (
            <span>Bez kraja otplate rata se računa svaki mjesec dok ne upišeš kraj.</span>
          ) : (
            <span>
              {pregledPlana.length} rata od {prikazDatuma(pregledPlana[0].datum)} do {prikazDatuma(pregledPlana[pregledPlana.length - 1].datum)} · ukupno{' '}
              <b>{eur(round2(pregledPlana.reduce((a, x) => a + x.iznos, 0)))}</b>
            </span>
          )}
        </p>
      )}
      <footer className="modal-podnozje">
        {!novo && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" disabled={!ok} onClick={spremi}>Spremi</button>
      </footer>
    </Modal>
  );
}

function VauceriKartica(props: { r: Rezija }) {
  const { podaci, izmijeni, sada } = useStanje();
  const lista = podaci.vauceri.filter((v) => v.rezijaId === props.r.id);
  const [uredi, setUredi] = useState<Partial<Vaucer> | null>(null);
  const spremi = async () => {
    const v = uredi!;
    if (!v.vrijediOd || !v.iznos) return;
    const zapis: Vaucer = { id: v.id ?? noviId('v'), rezijaId: props.r.id, vrijediOd: v.vrijediOd, vrijediDo: v.vrijediDo || undefined, iznos: v.iznos, komadaMjesecno: v.komadaMjesecno ?? 1 };
    setUredi(null);
    await izmijeni((d) => ({ ...d, vauceri: [...d.vauceri.filter((x) => x.id !== zapis.id), zapis].sort((a, b) => (a.vrijediOd < b.vrijediOd ? -1 : 1)) }));
  };
  const obrisi = async () => {
    const id = uredi!.id;
    setUredi(null);
    await izmijeni((d) => ({ ...d, vauceri: d.vauceri.filter((x) => x.id !== id) }));
  };
  return (
    <Kartica naslov="Vaučeri" akcije={<button onClick={() => setUredi({ vrijediOd: sada, iznos: 70, komadaMjesecno: 1 })}>+ Dodaj</button>}>
      {!lista.length && <p className="muted">Nema vaučera. Ako ih dobiješ, iznos računa umanjuje se za vrijednost vaučera (najmanje na 0 €, ostatak se ne prenosi).</p>}
      {lista.map((v) => (
        <div key={v.id} className="red-stavka klik" onClick={() => setUredi(v)}>
          <span>
            {v.komadaMjesecno} × {eur(v.iznos)} mjesečno
          </span>
          <span className="muted">
            od {nazivMjeseca(v.vrijediOd)}
            {v.vrijediDo ? ` do ${nazivMjeseca(v.vrijediDo)}` : ''}
          </span>
          {(!v.vrijediDo || v.vrijediDo >= sada) && v.vrijediOd <= sada ? <Oznaka vrsta="placeno">vrijedi</Oznaka> : <Oznaka vrsta="neutralno">ne vrijedi</Oznaka>}
        </div>
      ))}
      <p className="biljeska">Vaučer se primjenjuje prema mjesecu plaćanja. Ako izgubiš pravo, upiši "vrijedi do".</p>
      {uredi && (
        <Modal naslov="Vaučer" zatvori={() => setUredi(null)}>
          <div className="forma">
            <Polje oznaka="Iznos (€)">
              <BrojUnos vrijednost={uredi.iznos} promjena={(v) => setUredi({ ...uredi, iznos: v })} />
            </Polje>
            <Polje oznaka="Komada mjesečno">
              <BrojUnos vrijednost={uredi.komadaMjesecno} promjena={(v) => setUredi({ ...uredi, komadaMjesecno: v })} />
            </Polje>
            <Polje oznaka="Vrijedi od">
              <input type="month" value={uredi.vrijediOd ?? ''} onChange={(e) => setUredi({ ...uredi, vrijediOd: e.target.value })} />
            </Polje>
            <Polje oznaka="Vrijedi do" pomoc="prazno = i dalje vrijedi">
              <input type="month" value={uredi.vrijediDo ?? ''} onChange={(e) => setUredi({ ...uredi, vrijediDo: e.target.value || undefined })} />
            </Polje>
          </div>
          <footer className="modal-podnozje">
            {uredi.id && <button className="opasno" onClick={obrisi}>Obriši</button>}
            <span className="razmak" />
            <button onClick={() => setUredi(null)}>Odustani</button>
            <button className="primarno" onClick={spremi}>Spremi</button>
          </footer>
        </Modal>
      )}
    </Kartica>
  );
}

function PromjenaRateForma(props: { r: Rezija; pocetno: Partial<PromjenaRate>; zatvori: () => void }) {
  const { podaci, izmijeni } = useStanje();
  const [u, setU] = useState(props.pocetno);
  const ok = !!u.vrijediOd && !!u.iznos;
  const prvaRataMj = props.r.prvaRata ? mjesec(props.r.prvaRata) : '';
  const prije = u.vrijediOd ? rataZa(podaci.promjeneRata.filter((x) => x.id !== u.id), props.r, dodajMjesece(u.vrijediOd, -1)).iznos : undefined;
  const spremi = async () => {
    if (!ok) return;
    const zapis: PromjenaRate = {
      id: u.id ?? noviId('pr'),
      rezijaId: props.r.id,
      vrijediOd: u.vrijediOd!,
      iznos: u.iznos!,
      procjena: u.procjena || undefined,
      napomena: u.napomena?.trim() || undefined,
    };
    props.zatvori();
    await izmijeni((d) => ({ ...d, promjeneRata: [...d.promjeneRata.filter((x) => x.id !== zapis.id), zapis].sort((a, b) => (a.vrijediOd < b.vrijediOd ? -1 : 1)) }));
  };
  const obrisi = async () => {
    props.zatvori();
    await izmijeni((d) => ({ ...d, promjeneRata: d.promjeneRata.filter((x) => x.id !== u.id) }));
  };
  return (
    <Modal naslov={u.id ? 'Promjena rate' : 'Nova promjena rate'} zatvori={props.zatvori}>
      <div className="forma">
        <Polje oznaka="Od mjeseca" pomoc="prva rata s novim iznosom">
          <input type="month" value={u.vrijediOd ?? ''} min={prvaRataMj} onChange={(e) => setU({ ...u, vrijediOd: e.target.value })} />
        </Polje>
        <Polje oznaka="Nova rata (€)" pomoc={prije !== undefined ? `do tada ${eur(prije)}` : undefined}>
          <BrojUnos vrijednost={u.iznos} promjena={(v) => setU({ ...u, iznos: v })} />
        </Polje>
        <label className="kvacica">
          <input type="checkbox" checked={!!u.procjena} onChange={(e) => setU({ ...u, procjena: e.target.checked })} /> Iznos još nije poznat, ovo je procjena
        </label>
        <Polje oznaka="Napomena" siroko>
          <input value={u.napomena ?? ''} placeholder="npr. kraj APN subvencije" onChange={(e) => setU({ ...u, napomena: e.target.value })} />
        </Polje>
      </div>
      <footer className="modal-podnozje">
        {u.id && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" disabled={!ok} onClick={spremi}>Spremi</button>
      </footer>
    </Modal>
  );
}

function PromjeneRateKartica(props: { r: Rezija }) {
  const { podaci, sada } = useStanje();
  const { r } = props;
  const [uredi, setUredi] = useState<Partial<PromjenaRate> | null>(null);
  const lista = podaci.promjeneRata.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.vrijediOd < b.vrijediOd ? -1 : 1));
  const plan = planOtplate(r, podaci.promjeneRata);
  return (
    <Kartica naslov="Iznos rate kroz vrijeme" akcije={<button onClick={() => setUredi({ vrijediOd: dodajMjesece(sada, 1), iznos: rataZa(podaci.promjeneRata, r, sada).iznos })}>+ Promjena rate</button>}>
      <div className="red-stavka">
        <span>{eur(r.iznosRate)}</span>
        <span className="rasteg">
          <span className="muted">od {r.prvaRata ? nazivMjeseca(mjesec(r.prvaRata)) : 'prve rate'}</span>
          <span className="muted mali blok">početni iznos</span>
        </span>
      </div>
      {lista.map((x) => {
        const rata = plan.find((y) => y.mjesec >= x.vrijediOd);
        return (
          <div key={x.id} className="red-stavka klik" onClick={() => setUredi(x)}>
            <span>{eur(x.iznos)}</span>
            <span className="rasteg">
              <span className="muted">od {nazivMjeseca(x.vrijediOd)}</span>
              {(rata && !otvorenPlan(r)) || x.napomena ? (
                <span className="muted mali blok">
                  {[rata && !otvorenPlan(r) ? `${rata.redniBroj}. rata` : '', x.napomena].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </span>
            {x.procjena ? <Oznaka vrsta="upozorenje">procjena</Oznaka> : x.vrijediOd <= sada ? <Oznaka vrsta="placeno">vrijedi</Oznaka> : <Oznaka vrsta="neutralno">buduća</Oznaka>}
          </div>
        );
      })}
      <p className="biljeska">
        {lista.length
          ? 'Klikni promjenu da je urediš. Kad saznaš točan iznos, upiši ga i makni oznaku procjene.'
          : 'Ako se rata mijenja (npr. APN kredit nakon razdoblja subvencije), dodaj promjenu od tog mjeseca. Ako iznos još ne znaš, upiši procjenu i kasnije je ispravi.'}
      </p>
      {uredi && <PromjenaRateForma r={r} pocetno={uredi} zatvori={() => setUredi(null)} />}
    </Kartica>
  );
}

function PlanKartica(props: { r: Rezija }) {
  const { podaci, sada } = useStanje();
  const { r } = props;
  const s = stanjeOtplate(podaci, r, sada);
  const otvoren = otvorenPlan(r);
  const [sve, setSve] = useState(false);
  const trenutna = rataZa(podaci.promjeneRata, r, sada);
  const sljedeca = s.plan.find((x) => x.mjesec > sada && x.promjena);
  const plan = otvoren ? s.plan.filter((x) => x.mjesec <= dodajMjesece(sada, 12)) : s.plan;
  const prikaz = sve ? plan : plan.filter((x) => x.mjesec >= dodajMjesece(sada, -2)).slice(0, 8);
  const imaProcjenu = s.plan.some((x) => x.procjena && x.mjesec >= sada);
  return (
    <>
      <div className="plocice">
        <div className="plocica">
          <span className="plocica-naslov">Rata</span>
          <span className="plocica-broj">{eur(trenutna.iznos)}</span>
          <span className="plocica-opis">
            {sljedeca
              ? <>od {nazivMjeseca(sljedeca.mjesec)}: {eur(sljedeca.iznos)}{sljedeca.procjena ? ' (procjena)' : ''}</>
              : r.danPlacanja ? `${r.danPlacanja}. u mjesecu` : ''}
          </span>
        </div>
        {otvoren ? (
          <div className="plocica">
            <span className="plocica-naslov">Kraj otplate</span>
            <span className="plocica-broj">–</span>
            <span className="plocica-opis"><Oznaka vrsta="upozorenje">nije upisan</Oznaka> uredi i upiši zadnju ratu</span>
          </div>
        ) : (
          <>
            <div className="plocica">
              <span className="plocica-naslov">Ukupno plaćeno</span>
              <span className="plocica-broj">{eur(s.placeno)}</span>
              <span className="plocica-opis">{s.placenoRata} / {s.plan.length} rata</span>
              <span className="traka" aria-hidden><span style={{ width: `${(s.placenoRata / Math.max(1, s.plan.length)) * 100}%` }} /></span>
            </div>
            <div className="plocica">
              <span className="plocica-naslov">Preostalo{imaProcjenu ? ' (procjena)' : ''}</span>
              <span className="plocica-broj">{eur(s.preostaloIznos)}</span>
              <span className="plocica-opis">{s.preostaloRata} rata · zadnja {s.zavrsava ? nazivMjeseca(s.zavrsava) : ''}</span>
            </div>
          </>
        )}
        {otvoren && (
          <div className="plocica">
            <span className="plocica-naslov">Ukupno plaćeno</span>
            <span className="plocica-broj">{eur(s.placeno)}</span>
            <span className="plocica-opis">{podaci.placanja.filter((x) => x.rezijaId === r.id).length} uplata</span>
          </div>
        )}
        {!otvoren && (
          <div className="plocica">
            <span className="plocica-naslov">Ukupno{imaProcjenu ? ' (procjena)' : ''}</span>
            <span className="plocica-broj">{eur(round2(s.placeno + s.preostaloIznos))}</span>
            <span className="plocica-opis">plaćeno + preostalo</span>
          </div>
        )}
      </div>
      <div className="dva-stupca">
        <Kartica naslov="Plan otplate">
          <table className="tablica kompaktna">
            <tbody>
              {prikaz.map((x) => {
                const placeno = podaci.placanja.find((p) => p.rezijaId === r.id && mjesec(p.datum) === x.mjesec);
                return (
                  <tr key={x.redniBroj} className={x.mjesec > sada ? 'procjena-red' : ''}>
                    <td className="muted">{x.redniBroj}.</td>
                    <td>{prikazDatuma(x.datum)}</td>
                    <td className="br">
                      {eur(placeno?.iznos ?? x.iznos)}
                      {x.promjena && !placeno && <span className="muted mali"> nova rata</span>}
                    </td>
                    <td>
                      {placeno ? (
                        <Oznaka vrsta="placeno">plaćeno</Oznaka>
                      ) : x.mjesec < sada || (x.mjesec === sada && x.datum <= danas()) ? (
                        <Oznaka vrsta="automatski">automatski</Oznaka>
                      ) : x.procjena ? (
                        <Oznaka vrsta="upozorenje">procjena</Oznaka>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {plan.length > prikaz.length || sve ? <button className="tekst-gumb" onClick={() => setSve(!sve)}>{sve ? 'Prikaži manje' : `Cijeli plan (${plan.length})`}</button> : null}
          <p className="biljeska">Rate se automatski ubrajaju u mjesečni trošak. Plaćanje upiši samo ako je iznos drugačiji.</p>
        </Kartica>
        <PromjeneRateKartica r={r} />
      </div>
    </>
  );
}

function JednostavnaStranica(props: { r: Rezija }) {
  const { podaci, sada } = useStanje();
  const pl = podaci.placanja.filter((x) => x.rezijaId === props.r.id);
  const godisnje = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const x of pl) {
      const mj = mjesec(x.datum);
      if (!m.has(godina(mj))) m.set(godina(mj), new Map());
      const g = m.get(godina(mj))!;
      g.set(brojMjeseca(mj), round2((g.get(brojMjeseca(mj)) ?? 0) + x.iznos));
    }
    return m;
  }, [pl]);
  const zadnji = [...pl].sort((a, b) => (a.datum < b.datum ? -1 : 1)).pop();
  const ovaGodina = pl.filter((x) => x.datum.startsWith(sada.slice(0, 4))).reduce((a, x) => a + x.iznos, 0);
  const proslaGodina = pl.filter((x) => x.datum.startsWith(String(godina(sada) - 1))).reduce((a, x) => a + x.iznos, 0);
  return (
    <>
      <div className="plocice">
        <div className="plocica">
          <span className="plocica-naslov">Zadnje plaćanje</span>
          <span className="plocica-broj">{eur(zadnji?.iznos)}</span>
          <span className="plocica-opis">{zadnji ? prikazDatuma(zadnji.datum) : ''}</span>
        </div>
        <div className="plocica">
          <span className="plocica-naslov">{props.r.vrsta === 'jednokratno' ? 'Ove godine' : `Ukupno ${godina(sada)}.`}</span>
          <span className="plocica-broj">{eur(ovaGodina)}</span>
          <span className="plocica-opis">{godina(sada) - 1}.: {eur(proslaGodina)}</span>
        </div>
      </div>
      {props.r.vrsta !== 'jednokratno' && godisnje.size > 0 && (
        <Kartica naslov="Usporedba po godinama">
          <GodisnjiGraf podaci={godisnje} />
          <p className="biljeska">Po mjesecu plaćanja.</p>
        </Kartica>
      )}
    </>
  );
}

export function RezijaStranica(props: { id: string; idi: (r: Ruta) => void }) {
  const { podaci } = useStanje();
  const r = podaci.rezije.find((x) => x.id === props.id);
  const [uredi, setUredi] = useState(false);
  const [placanje, setPlacanje] = useState(false);
  if (!r) return <div className="stranica"><p>Režija nije pronađena.</p></div>;
  const brojilo = r.vrsta === 'struja' || r.vrsta === 'voda' || r.vrsta === 'smece';
  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <div>
          <h1>{r.naziv}</h1>
          <span className="muted">
            {nazivVrste(r.vrsta)} · {r.grupa}
            {r.platitelj && <> · plaća {r.platitelj}</>}
            {!r.aktivna && <> · <Oznaka vrsta="neutralno">neaktivna</Oznaka></>}
          </span>
        </div>
        <div className="akcije">
          <button onClick={() => setUredi(true)}>Uredi</button>
          <button className="primarno" onClick={() => setPlacanje(true)}>+ Plaćanje</button>
        </div>
      </div>
      {brojilo && <BrojiloStranica r={r} />}
      {(r.vrsta === 'obrok' || r.vrsta === 'kredit') && <PlanKartica r={r} />}
      {(r.vrsta === 'jednostavna' || r.vrsta === 'jednokratno') && <JednostavnaStranica r={r} />}
      {r.napomena && <p className="napomena-kartica">{r.napomena}</p>}
      {brojilo && (
        <div className="dva-stupca">
          <CjenikKartica r={r} />
          <VauceriKartica r={r} />
        </div>
      )}
      <Kartica naslov="Plaćanja">
        <PopisPlacanja rezijaId={r.id} limit={12} />
      </Kartica>
      {uredi && <RezijaForma pocetno={r} zatvori={() => setUredi(false)} nakon={(id) => !id && props.idi({ stranica: 'rezije' })} />}
      {placanje && <PlacanjeForma pocetno={{ rezijaId: r.id, datum: danas(), zaMjesec: brojilo ? dodajMjesece(mjesec(danas()), -1) : undefined }} zatvori={() => setPlacanje(false)} />}
    </div>
  );
}
