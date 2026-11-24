import { useState } from 'react';
import { imeMjeseca } from '../domain/dates';
import { useStanje } from '../state';
import { ZADANO_IME } from '../domain/calc';
import { BrojUnos, Kartica, Polje } from './common';

export function PostavkeStranica() {
  const { podaci, izmijeni, izvor, ponovnoUcitaj, preuzmiKopiju, zatvori } = useStanje();
  const [p, setP] = useState(podaci.postavke);
  const promijenjeno = JSON.stringify(p) !== JSON.stringify(podaci.postavke);
  return (
    <div className="stranica">
      <div className="naslov-stranice">
        <h1>Postavke</h1>
      </div>
      <Kartica naslov="Datoteka s podacima">
        <p>{izvor.opis}</p>
        <p className="muted">
          Svi podaci su u jednoj Excel datoteci (listovi Režije, Plaćanja, Očitanja, Cjenici, Vaučeri, Promjene rata, Rasporedi, Postavke). Možeš je otvoriti i u Excelu,
          samo nemoj mijenjati naslove stupaca.
        </p>
        <div className="akcije">
          <button onClick={ponovnoUcitaj}>Učitaj ponovno</button>
          <button onClick={preuzmiKopiju}>Preuzmi kopiju</button>
          <button onClick={zatvori}>Promijeni datoteku</button>
        </div>
      </Kartica>
      <PlatiteljiKartica />
      <Kartica naslov="Struja: prag potrošnje">
        <p className="muted">
          Kad potrošnja u razdoblju prijeđe prag, višak (podijeljen na VT i NT u omjeru potrošnje zadnjeg mjeseca razdoblja) naplaćuje se po
          cijeni "iznad praga" iz cjenika.
        </p>
        <div className="forma">
          <Polje oznaka="Prag (kWh)">
            <BrojUnos vrijednost={p.strujaPrag} promjena={(v) => setP({ ...p, strujaPrag: v ?? 0 })} />
          </Polje>
          <Polje oznaka="Trajanje razdoblja (mjeseci)">
            <BrojUnos vrijednost={p.strujaPragTrajanje} promjena={(v) => setP({ ...p, strujaPragTrajanje: v ?? 6 })} />
          </Polje>
          <Polje oznaka="Razdoblje završava u" siroko pomoc={p.strujaPragMjeseci.map(imeMjeseca).join(' i ')}>
            <input
              value={p.strujaPragMjeseci.join(', ')}
              onChange={(e) => setP({ ...p, strujaPragMjeseci: e.target.value.split(/[,;\s]+/).map(Number).filter((x) => x >= 1 && x <= 12) })}
            />
          </Polje>
        </div>
        <div className="akcije">
          <button className="primarno" disabled={!promijenjeno} onClick={() => izmijeni((d) => ({ ...d, postavke: p }))}>Spremi</button>
        </div>
      </Kartica>
    </div>
  );
}

function PlatiteljiKartica() {
  const { podaci, izmijeni } = useStanje();
  const [ja, ...ostali] = podaci.postavke.platitelji;
  const [mojeIme, setMojeIme] = useState(ja || ZADANO_IME);
  // stari naziv -> novi naziv (prazno = obrisan)
  const [redovi, setRedovi] = useState(() => ostali.map((x) => ({ staro: x as string | undefined, novo: x })));
  const ime = mojeIme.trim() || ZADANO_IME;
  const drugi = redovi.map((x) => x.novo.trim()).filter(Boolean);
  const lista = drugi.length ? [ime, ...drugi] : [];
  const duplikat = new Set(lista).size !== lista.length;
  const promijenjeno = JSON.stringify(lista) !== JSON.stringify(podaci.postavke.platitelji) || (!!ja && ime !== ja);
  const koristi = (x: string) => podaci.rezije.filter((r) => r.platitelj === x).length + podaci.placanja.filter((p) => p.platitelj === x).length;

  const spremi = async () => {
    const mapa = new Map<string, string | undefined>();
    if (ja && ja !== ime) mapa.set(ja, ime);
    for (const r of redovi) if (r.staro) mapa.set(r.staro, r.novo.trim() || undefined);
    // zapisi koji upućuju na tebe ne trebaju ime (prazno = ti)
    const preimenuj = (v: string | undefined) => {
      const n = v && mapa.has(v) ? mapa.get(v) : v;
      return n === ime ? undefined : n;
    };
    await izmijeni((d) => ({
      ...d,
      postavke: { ...d.postavke, platitelji: lista },
      rezije: d.rezije.map((r) => (r.platitelj ? { ...r, platitelj: preimenuj(r.platitelj) } : r)),
      placanja: d.placanja.map((p) => (p.platitelj ? { ...p, platitelj: preimenuj(p.platitelj) } : p)),
    }));
    setRedovi(drugi.map((x) => ({ staro: x, novo: x })));
  };

  return (
    <Kartica naslov="Tko plaća">
      <p className="muted">
        Sve režije i plaćanja vode se na tebe, osim onih kod kojih odabereš nekog drugog. Ovdje dodaj druge osobe ili račune s kojih se nešto
        plaća. Dok nikoga ne dodaš, ova mogućnost je skrivena.
      </p>
      <div className="forma">
        <Polje oznaka="Tvoje ime u pregledima" pomoc="npr. Ja ili tvoje ime">
          <input value={mojeIme} placeholder={ZADANO_IME} onChange={(e) => setMojeIme(e.target.value)} />
        </Polje>
      </div>
      <p className="oznaka">Ostali platitelji</p>
      <div className="platitelji">
        {redovi.map((x, i) => (
          <div key={i} className="platitelj-red">
            <input
              value={x.novo}
              placeholder="ime"
              onChange={(e) => setRedovi(redovi.map((y, j) => (j === i ? { ...y, novo: e.target.value } : y)))}
            />
            {x.staro && x.staro !== x.novo.trim() && (
              <span className="muted mali">
                {x.novo.trim() ? `preimenuje "${x.staro}"` : `"${x.staro}" se briše, njegovo se vodi na tebe`} ({koristi(x.staro)} zapisa)
              </span>
            )}
            <button className="malo" onClick={() => setRedovi(redovi.map((y, j) => (j === i ? { ...y, novo: '' } : y)).filter((y) => y.staro || y.novo))}>
              Ukloni
            </button>
          </div>
        ))}
        <button className="tekst-gumb" onClick={() => setRedovi([...redovi, { staro: undefined, novo: '' }])}>+ Dodaj platitelja</button>
      </div>
      {duplikat && <p className="greska-tekst">Imena se ne smiju ponavljati.</p>}
      <div className="akcije">
        <button className="primarno" disabled={!promijenjeno || duplikat} onClick={spremi}>Spremi</button>
      </div>
    </Kartica>
  );
}
