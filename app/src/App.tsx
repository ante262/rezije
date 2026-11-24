import { useEffect, useState } from 'react';
import type { Podaci } from './domain/types';
import type { Izvor } from './storage/izvor';
import { zapamtiIzvor } from './storage/izvor';
import { StanjeProvider, useStanje } from './state';
import { Pocetak } from './ui/Pocetak';
import { Pregled } from './ui/Pregled';
import { RezijaStranica } from './ui/Rezija';
import { ObrociStranica, PovijestStranica, RezijeStranica } from './ui/Popisi';
import { PostavkeStranica } from './ui/Postavke';

export type Ruta =
  | { stranica: 'pregled' }
  | { stranica: 'rezije' }
  | { stranica: 'rezija'; id: string }
  | { stranica: 'obroci' }
  | { stranica: 'povijest' }
  | { stranica: 'postavke' };

function izHasha(): Ruta {
  const [s, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (s === 'rezija' && id) return { stranica: 'rezija', id: decodeURIComponent(id) };
  if (s === 'rezije' || s === 'obroci' || s === 'povijest' || s === 'postavke') return { stranica: s };
  return { stranica: 'pregled' };
}
const uHash = (r: Ruta) => (r.stranica === 'rezija' ? `#/rezija/${encodeURIComponent(r.id)}` : r.stranica === 'pregled' ? '#/' : `#/${r.stranica}`);

const NAV: { ruta: Ruta; naziv: string; ikona: string }[] = [
  { ruta: { stranica: 'pregled' }, naziv: 'Pregled', ikona: '◧' },
  { ruta: { stranica: 'rezije' }, naziv: 'Režije', ikona: '☰' },
  { ruta: { stranica: 'obroci' }, naziv: 'Obroci', ikona: '◔' },
  { ruta: { stranica: 'povijest' }, naziv: 'Plaćanja', ikona: '≡' },
  { ruta: { stranica: 'postavke' }, naziv: 'Postavke', ikona: '⚙' },
];

function StatusSpremanja() {
  const { status, preuzmiKopiju, ponovnoUcitaj } = useStanje();
  if (status.vrsta === 'spremanje') return <span className="status">Spremanje…</span>;
  if (status.vrsta === 'nespremljeno')
    return (
      <span className="status upozorenje">
        Izmjene nisu spremljene · <button className="tekst-gumb" onClick={preuzmiKopiju}>Preuzmi datoteku</button>
      </span>
    );
  if (status.vrsta === 'greska')
    return (
      <span className="status greska" title={status.poruka}>
        ⚠ {status.poruka} <button className="tekst-gumb" onClick={ponovnoUcitaj}>Učitaj ponovno</button>
      </span>
    );
  return <span className="status muted">✓ Spremljeno</span>;
}

function Ljuska() {
  const { podaci } = useStanje();
  const [ruta, setRuta] = useState<Ruta>(izHasha);
  useEffect(() => {
    const h = () => setRuta(izHasha());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const idi = (r: Ruta) => {
    location.hash = uHash(r);
    window.scrollTo(0, 0);
  };
  const aktivno = (r: Ruta) => r.stranica === ruta.stranica || (r.stranica === 'rezije' && ruta.stranica === 'rezija' && !podaci.rezije.find((x) => x.id === ruta.id && (x.vrsta === 'obrok' || x.vrsta === 'kredit'))) || (r.stranica === 'obroci' && ruta.stranica === 'rezija' && !!podaci.rezije.find((x) => x.id === ruta.id && (x.vrsta === 'obrok' || x.vrsta === 'kredit')));
  const brzo = podaci.rezije.filter((r) => r.aktivna && (r.vrsta === 'struja' || r.vrsta === 'voda' || r.vrsta === 'smece'));

  return (
    <div className="ljuska">
      <nav className="bocna">
        <div className="logo">Režije</div>
        {NAV.map((n) => (
          <a key={n.naziv} href={uHash(n.ruta)} className={aktivno(n.ruta) ? 'aktivno' : ''}>
            <span aria-hidden className="nav-ikona">{n.ikona}</span>
            {n.naziv}
          </a>
        ))}
        {brzo.length > 0 && <div className="nav-odjeljak">Brojila</div>}
        {brzo.map((r) => (
          <a key={r.id} href={uHash({ stranica: 'rezija', id: r.id })} className={ruta.stranica === 'rezija' && ruta.id === r.id ? 'aktivno' : ''}>
            <span aria-hidden className="nav-ikona">•</span>
            {r.naziv}
          </a>
        ))}
        <div className="razmak" />
        <StatusSpremanja />
      </nav>
      <main>
        <div className="mob-status"><StatusSpremanja /></div>
        {ruta.stranica === 'pregled' && <Pregled idi={idi} />}
        {ruta.stranica === 'rezije' && <RezijeStranica idi={idi} />}
        {ruta.stranica === 'rezija' && <RezijaStranica key={ruta.id} id={ruta.id} idi={idi} />}
        {ruta.stranica === 'obroci' && <ObrociStranica idi={idi} />}
        {ruta.stranica === 'povijest' && <PovijestStranica />}
        {ruta.stranica === 'postavke' && <PostavkeStranica />}
      </main>
      <nav className="donja">
        {NAV.map((n) => (
          <a key={n.naziv} href={uHash(n.ruta)} className={aktivno(n.ruta) ? 'aktivno' : ''}>
            <span aria-hidden className="nav-ikona">{n.ikona}</span>
            <span>{n.naziv}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [otvoreno, setOtvoreno] = useState<{ izvor: Izvor; podaci: Podaci } | null>(null);
  if (!otvoreno) return <Pocetak otvoreno={(izvor, podaci) => setOtvoreno({ izvor, podaci })} />;
  return (
    <StanjeProvider
      izvor={otvoreno.izvor}
      pocetni={otvoreno.podaci}
      zatvori={() => {
        zapamtiIzvor(null);
        setOtvoreno(null);
      }}
    >
      <Ljuska />
    </StanjeProvider>
  );
}
