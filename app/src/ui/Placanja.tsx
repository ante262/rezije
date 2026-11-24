import { useMemo, useState } from 'react';
import { imaPlatitelje, platiteljPlacanja, vauceriZa, zadaniPlatitelj, type FilterPlatitelja } from '../domain/calc';
import { danas, dodajMjesece, eur, mjesec, nazivMjeseca, prikazDatuma, round2 } from '../domain/dates';
import type { Placanje } from '../domain/types';
import { noviId, useStanje } from '../state';
import { BrojUnos, Modal, PlatiteljOdabir, Polje } from './common';

const oblikPlacanja = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'upisano plaćanje' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'upisana plaćanja' : 'upisanih plaćanja';

export function PlacanjeForma(props: { pocetno?: Partial<Placanje>; zatvori: () => void }) {
  const { podaci, izmijeni, serije } = useStanje();
  const uredivanje = !!props.pocetno?.id;
  const [p, setP] = useState<Partial<Placanje>>(() => {
    const datum = props.pocetno?.datum ?? danas();
    const r = podaci.rezije.find((x) => x.id === props.pocetno?.rezijaId);
    const zaMjesec = props.pocetno?.zaMjesec ?? (r && ['struja', 'voda', 'smece'].includes(r.vrsta) ? dodajMjesece(mjesec(datum), -1) : undefined);
    const pocetno: Partial<Placanje> = { datum, zaMjesec, ...props.pocetno };
    if (!pocetno.id && !pocetno.platitelj && r?.platitelj) pocetno.platitelj = r.platitelj;
    // račun iz izračuna (struja, voda, smeće) ako nije zadan
    if (r && zaMjesec && pocetno.racun === undefined && !pocetno.id) {
      const e = serije.get(r.id)?.find((x) => x.mjesec === zaMjesec);
      if (e?.racun !== undefined) {
        pocetno.racun = e.racun;
        pocetno.vauceri ??= e.vauceri || undefined;
        pocetno.iznos ??= e.zaPlatiti;
      }
    }
    if (r && pocetno.naknada === undefined && !pocetno.id) {
      pocetno.naknada = podaci.placanja.filter((x) => x.rezijaId === r.id).sort((a, b) => (a.datum < b.datum ? 1 : -1))[0]?.naknada;
    }
    return pocetno;
  });
  const [rucniIznos, setRucniIznos] = useState(uredivanje);
  const [zapamti, setZapamti] = useState(false);
  const rezija = podaci.rezije.find((r) => r.id === p.rezijaId);
  const brojilo = rezija && ['struja', 'voda', 'smece'].includes(rezija.vrsta);
  const izracun = useMemo(
    () => (brojilo && p.zaMjesec ? serije.get(rezija!.id)?.find((x) => x.mjesec === p.zaMjesec) : undefined),
    [brojilo, p.zaMjesec, rezija, serije],
  );
  const vaucer = rezija ? vauceriZa(podaci, rezija.id, mjesec(p.datum ?? danas())) : { komada: 0, iznos: 0 };
  const imaVaucer = vaucer.iznos > 0 || (p.vauceri ?? 0) > 0;

  // prijedlog iznosa za plaćanje: račun − vaučeri
  const prijedlog = (racun: number | undefined, vauceri: number | undefined) =>
    racun === undefined ? undefined : round2(Math.max(0, racun - (vauceri ?? 0) * (vaucer.iznos || 70)));

  const postavi = (izmjena: Partial<Placanje>) =>
    setP((s) => {
      const n = { ...s, ...izmjena };
      if (!rucniIznos && (izmjena.racun !== undefined || izmjena.vauceri !== undefined || 'racun' in izmjena)) {
        n.iznos = imaVaucer ? prijedlog(n.racun, n.vauceri) : n.racun;
      }
      return n;
    });

  const odaberiRezijuIliMjesec = (izmjena: Partial<Placanje>) => {
    setP((s) => {
      const n = { ...s, ...izmjena };
      const r = podaci.rezije.find((x) => x.id === n.rezijaId);
      if (r && izmjena.rezijaId && ['struja', 'voda', 'smece'].includes(r.vrsta) && !n.zaMjesec) n.zaMjesec = dodajMjesece(mjesec(n.datum ?? danas()), -1);
      const e = r && n.zaMjesec ? serije.get(r.id)?.find((x) => x.mjesec === n.zaMjesec) : undefined;
      if (e?.racun !== undefined && !uredivanje) {
        n.racun = e.racun;
        const v = vauceriZa(podaci, r!.id, mjesec(n.datum ?? danas()));
        n.vauceri = v.komada || undefined;
        if (!rucniIznos) n.iznos = round2(Math.max(0, e.racun - v.komada * v.iznos));
      }
      const zadnje = podaci.placanja.filter((x) => x.rezijaId === n.rezijaId).sort((a, b) => (a.datum < b.datum ? 1 : -1))[0];
      if (izmjena.rezijaId && n.naknada === undefined && zadnje?.naknada) n.naknada = zadnje.naknada;
      if (izmjena.rezijaId && !uredivanje) n.platitelj = r?.platitelj;
      return n;
    });
  };

  // platitelj: "samo ovo plaćanje" ili "ovo i sva sljedeća" (upisana kasnija plaćanja i buduća)
  const zadaniIme = zadaniPlatitelj(podaci);
  const odabraniPlatitelj = p.platitelj || zadaniIme;
  const kasnijaRazlicita = podaci.placanja.filter(
    (x) => x.rezijaId === p.rezijaId && x.id !== p.id && x.datum >= (p.datum ?? danas()) && (x.platitelj || zadaniIme) !== odabraniPlatitelj,
  );
  const pitajOpseg = !!rezija && imaPlatitelje(podaci) && ((rezija.platitelj || zadaniIme) !== odabraniPlatitelj || kasnijaRazlicita.length > 0);

  const ok = p.rezijaId && p.datum && p.iznos !== undefined;
  const spremi = async () => {
    if (!ok) return;
    const zapis: Placanje = {
      id: p.id ?? noviId('p'),
      datum: p.datum!,
      rezijaId: p.rezijaId!,
      zaMjesec: p.zaMjesec || undefined,
      iznos: round2(p.iznos!),
      racun: p.racun,
      vauceri: p.vauceri || undefined,
      naknada: p.naknada || undefined,
      platitelj: p.platitelj && p.platitelj !== zadaniPlatitelj(podaci) ? p.platitelj : undefined,
      napomena: p.napomena?.trim() || undefined,
    };
    props.zatvori();
    const iSljedeca = pitajOpseg && zapamti;
    const kasnijaId = new Set(iSljedeca ? kasnijaRazlicita.map((x) => x.id) : []);
    await izmijeni((d) => ({
      ...d,
      rezije: iSljedeca ? d.rezije.map((r) => (r.id === zapis.rezijaId ? { ...r, platitelj: zapis.platitelj } : r)) : d.rezije,
      placanja: [...d.placanja.filter((x) => x.id !== zapis.id), zapis]
        .map((x) => (kasnijaId.has(x.id) ? { ...x, platitelj: zapis.platitelj } : x))
        .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)),
    }));
  };
  const obrisi = async () => {
    if (!p.id || !confirm('Obrisati ovo plaćanje?')) return;
    props.zatvori();
    await izmijeni((d) => ({ ...d, placanja: d.placanja.filter((x) => x.id !== p.id) }));
  };

  const aktivne = podaci.rezije.filter((r) => r.aktivna || r.id === p.rezijaId).sort((a, b) => a.redoslijed - b.redoslijed);

  return (
    <Modal naslov={uredivanje ? 'Uredi plaćanje' : 'Novo plaćanje'} zatvori={props.zatvori}>
      <div className="forma">
        <Polje oznaka="Režija" siroko>
          <select value={p.rezijaId ?? ''} onChange={(e) => odaberiRezijuIliMjesec({ rezijaId: e.target.value })} autoFocus={!p.rezijaId}>
            <option value="" disabled>Odaberi…</option>
            {aktivne.map((r) => (
              <option key={r.id} value={r.id}>{r.naziv}</option>
            ))}
          </select>
        </Polje>
        <Polje oznaka="Datum plaćanja">
          <input type="date" value={p.datum ?? ''} onChange={(e) => setP({ ...p, datum: e.target.value })} />
        </Polje>
        <Polje oznaka="Za mjesec" pomoc={brojilo ? 'mjesec potrošnje' : 'neobavezno'}>
          <input type="month" value={p.zaMjesec ?? ''} onChange={(e) => odaberiRezijuIliMjesec({ zaMjesec: e.target.value || undefined })} />
        </Polje>
        {(brojilo || imaVaucer || p.racun !== undefined) && (
          <Polje oznaka="Iznos računa" pomoc={izracun?.racun !== undefined ? `izračunato: ${eur(izracun.racun)}` : undefined}>
            <BrojUnos vrijednost={p.racun} promjena={(v) => postavi({ racun: v })} />
          </Polje>
        )}
        {imaVaucer && (
          <Polje oznaka="Vaučeri" pomoc={`${eur(vaucer.iznos || 70)} po komadu`}>
            <BrojUnos vrijednost={p.vauceri} promjena={(v) => postavi({ vauceri: v })} />
          </Polje>
        )}
        <Polje oznaka="Plaćeno (€)">
          <BrojUnos
            vrijednost={p.iznos}
            autoFocus={!!p.rezijaId && !brojilo}
            promjena={(v) => {
              setRucniIznos(true);
              setP((s) => ({ ...s, iznos: v }));
            }}
          />
        </Polje>
        <Polje oznaka="Naknada (€)">
          <BrojUnos vrijednost={p.naknada} promjena={(v) => setP({ ...p, naknada: v })} />
        </Polje>
        {imaPlatitelje(podaci) && (
          <Polje oznaka="Platio" pomoc={rezija?.platitelj ? `za ovu režiju obično ${rezija.platitelj}` : undefined}>
            <PlatiteljOdabir vrijednost={p.platitelj} promjena={(v) => setP({ ...p, platitelj: v })} />
          </Polje>
        )}
        {pitajOpseg && (
          <div className="izbor-opsega" role="radiogroup" aria-label="Na što se odnosi platitelj">
            <label className="kvacica">
              <input type="radio" name="opseg" checked={!zapamti} onChange={() => setZapamti(false)} /> Samo ovo plaćanje
            </label>
            <label className="kvacica">
              <input type="radio" name="opseg" checked={zapamti} onChange={() => setZapamti(true)} />
              <span>
                Ovo i sva sljedeća plaćanja
                <span className="muted mali blok">
                  {kasnijaRazlicita.length > 0 && `mijenja još ${kasnijaRazlicita.length} ${oblikPlacanja(kasnijaRazlicita.length)} · `}
                  {rezija!.naziv} ubuduće plaća {odabraniPlatitelj}
                </span>
              </span>
            </label>
          </div>
        )}
        <Polje oznaka="Napomena" siroko>
          <input value={p.napomena ?? ''} onChange={(e) => setP({ ...p, napomena: e.target.value })} />
        </Polje>
      </div>
      <footer className="modal-podnozje">
        {uredivanje && <button className="opasno" onClick={obrisi}>Obriši</button>}
        <span className="razmak" />
        <button onClick={props.zatvori}>Odustani</button>
        <button className="primarno" disabled={!ok} onClick={spremi}>Spremi</button>
      </footer>
    </Modal>
  );
}

export function PopisPlacanja(props: { rezijaId?: string; limit?: number; platitelj?: FilterPlatitelja }) {
  const { podaci } = useStanje();
  const zadani = zadaniPlatitelj(podaci);
  const [uredi, setUredi] = useState<Placanje | null>(null);
  const [sve, setSve] = useState(false);
  const lista = podaci.placanja
    .filter((x) => !props.rezijaId || x.rezijaId === props.rezijaId)
    .filter((x) => props.platitelj === undefined || props.platitelj === null || platiteljPlacanja(x, zadani) === props.platitelj)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const prikaz = sve || !props.limit ? lista : lista.slice(0, props.limit);
  const naziv = (id: string) => podaci.rezije.find((r) => r.id === id)?.naziv ?? id;
  return (
    <>
      <div className="tablica-omot">
        <table className="tablica">
          <thead>
            <tr>
              <th>Datum</th>
              {!props.rezijaId && <th>Režija</th>}
              <th>Za mjesec</th>
              <th className="br">Račun</th>
              <th className="br">Plaćeno</th>
              <th className="br">Naknada</th>
              {imaPlatitelje(podaci) && <th>Platitelj</th>}
              <th>Napomena</th>
            </tr>
          </thead>
          <tbody>
            {prikaz.map((x) => (
              <tr key={x.id} className="klik" onClick={() => setUredi(x)}>
                <td>{prikazDatuma(x.datum)}</td>
                {!props.rezijaId && <td>{naziv(x.rezijaId)}</td>}
                <td className="muted">{x.zaMjesec ? nazivMjeseca(x.zaMjesec) : ''}</td>
                <td className="br muted">{x.racun !== undefined ? eur(x.racun) : ''}</td>
                <td className="br">
                  {eur(x.iznos)}
                  {x.vauceri ? <span className="muted mali"> · {x.vauceri > 1 ? `${x.vauceri} vaučera` : 'vaučer'}</span> : null}
                </td>
                <td className="br muted">{x.naknada ? eur(x.naknada) : ''}</td>
                {imaPlatitelje(podaci) && <td className="muted">{platiteljPlacanja(x, zadani)}</td>}
                <td className="muted napomena">{x.napomena}</td>
              </tr>
            ))}
            {!prikaz.length && (
              <tr>
                <td colSpan={8} className="prazno">Nema plaćanja.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {props.limit && lista.length > props.limit && (
        <button className="tekst-gumb" onClick={() => setSve(!sve)}>{sve ? 'Prikaži manje' : `Prikaži sva (${lista.length})`}</button>
      )}
      {uredi && <PlacanjeForma pocetno={uredi} zatvori={() => setUredi(null)} />}
    </>
  );
}
