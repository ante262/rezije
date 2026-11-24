import { useEffect, useRef, useState } from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { zapisiDatoteku } from '../domain/workbook';
import { ZADANE_POSTAVKE, type Podaci } from '../domain/types';
import { zapamceniIzvor, zapamtiIzvor, type Izvor } from '../storage/izvor';
import { izvorIzDatoteke, novaLokalna, odaberiLokalnu, podrzanLokalni, zapamcenaLokalna, zaboraviLokalnu } from '../storage/lokalno';
import { clientId, napraviNaOneDriveu, onedriveIzvor, odjava, postaviClientId, prijava, prijavljeniRacun, redirectUri, xlsxUMapi } from '../storage/onedrive';
import { ucitajIzvor } from '../state';
import { Kartica, Polje } from './common';

const PRAZNO: Podaci = {
  rezije: [],
  placanja: [],
  ocitanja: [],
  cjenici: [],
  vauceri: [],
  promjeneRata: [],
  rasporedi: [],
  postavke: ZADANE_POSTAVKE,
};

/** Početni ekran: odabir datoteke (OneDrive ili lokalno) i automatsko otvaranje zapamćene. */
export function Pocetak(props: { otvoreno: (izvor: Izvor, p: Podaci) => void }) {
  const [greska, setGreska] = useState<string>();
  const [radi, setRadi] = useState(true);
  const [racun, setRacun] = useState<AccountInfo | null>(null);
  const [trebaDozvolu, setTrebaDozvolu] = useState(false);
  const [cid, setCid] = useState(clientId());
  const zap = zapamceniIzvor();
  const [putanja, setPutanja] = useState(zap?.putanja ?? '/Režije/rezije-podaci.xlsx');
  const [mapa, setMapa] = useState<{ putanja: string; stavke: { naziv: string; putanja: string }[] } | null>(null);
  const pokrenuto = useRef(false);

  const otvori = async (izvor: Izvor, zapamti?: Parameters<typeof zapamtiIzvor>[0]) => {
    setRadi(true);
    setGreska(undefined);
    try {
      const p = await ucitajIzvor(izvor);
      if (zapamti) zapamtiIzvor(zapamti);
      props.otvoreno(izvor, p);
    } catch (e) {
      setGreska(e instanceof Error ? e.message : String(e));
      setRadi(false);
    }
  };

  useEffect(() => {
    if (pokrenuto.current) return;
    pokrenuto.current = true;
    (async () => {
      try {
        const acc = await prijavljeniRacun();
        setRacun(acc);
        if (zap?.vrsta === 'onedrive' && zap.putanja && acc) return otvori(onedriveIzvor(zap.putanja));
        if (zap?.vrsta === 'lokalno') {
          const l = await zapamcenaLokalna(false);
          if (l === 'treba-dozvolu') setTrebaDozvolu(true);
          else if (l) return otvori(l);
        }
      } catch (e) {
        setGreska(e instanceof Error ? e.message : String(e));
      }
      setRadi(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pregledaj = async (m: string) => {
    try {
      setMapa({ putanja: m, stavke: await xlsxUMapi(m) });
    } catch (e) {
      setGreska(e instanceof Error ? e.message : String(e));
    }
  };

  if (radi)
    return (
      <div className="pocetak">
        <p className="muted">Učitavanje…</p>
      </div>
    );

  return (
    <div className="pocetak">
      <h1>Režije</h1>
      <p className="muted">Podaci su u tvojoj Excel datoteci. Odaberi gdje se nalazi.</p>
      {greska && <p className="greska">{greska}</p>}

      <Kartica naslov="OneDrive (računalo i mobitel)">
        {!cid || !clientId() ? (
          <>
            <p className="muted">
              Za pristup OneDriveu treba jednom registrirati aplikaciju u Microsoft Entra (besplatno) i ovdje upisati njen Client ID.
              Redirect URI: <code>{redirectUri()}</code>
            </p>
            <div className="forma">
              <Polje oznaka="Client ID" siroko>
                <input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
              </Polje>
            </div>
            <button className="primarno" disabled={!/^[0-9a-f-]{36}$/i.test(cid.trim())} onClick={() => { postaviClientId(cid); location.reload(); }}>
              Spremi
            </button>
          </>
        ) : !racun ? (
          <button className="primarno" onClick={() => prijava().catch((e) => setGreska(String(e)))}>Prijava s Microsoft računom</button>
        ) : (
          <>
            <p className="muted">Prijavljen: {racun.username} · <button className="tekst-gumb" onClick={() => odjava()}>odjava</button></p>
            <div className="forma">
              <Polje oznaka="Putanja datoteke na OneDriveu" siroko>
                <input value={putanja} onChange={(e) => setPutanja(e.target.value)} />
              </Polje>
            </div>
            <div className="akcije">
              <button className="primarno" onClick={() => otvori(onedriveIzvor(putanja), { vrsta: 'onedrive', putanja })}>Otvori</button>
              <button onClick={() => pregledaj(putanja.includes('.xlsx') ? putanja.slice(0, putanja.lastIndexOf('/')) || '/' : putanja)}>Pregledaj mapu</button>
              <button
                onClick={async () => {
                  try {
                    await napraviNaOneDriveu(putanja, zapisiDatoteku(PRAZNO));
                    await otvori(onedriveIzvor(putanja), { vrsta: 'onedrive', putanja });
                  } catch (e) {
                    setGreska(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Nova prazna datoteka
              </button>
            </div>
            {mapa && (
              <div className="popis mapa">
                <div className="muted mali">{mapa.putanja}</div>
                {mapa.putanja !== '/' && (
                  <button className="popis-stavka" onClick={() => pregledaj(mapa.putanja.slice(0, mapa.putanja.lastIndexOf('/')) || '/')}>..</button>
                )}
                {mapa.stavke.map((s) => (
                  <button
                    key={s.putanja}
                    className="popis-stavka"
                    onClick={() => (s.naziv.endsWith('/') ? pregledaj(s.putanja) : (setPutanja(s.putanja), setMapa(null)))}
                  >
                    {s.naziv}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Kartica>

      <Kartica naslov="Datoteka na ovom računalu">
        {podrzanLokalni() ? (
          <>
            <p className="muted">Npr. datoteka u OneDrive mapi na računalu. Izmjene se spremaju izravno u nju (Chrome / Edge).</p>
            <div className="akcije">
              {trebaDozvolu && (
                <button className="primarno" onClick={async () => { const l = await zapamcenaLokalna(true); if (l && l !== 'treba-dozvolu') otvori(l); }}>
                  Otvori zadnju datoteku
                </button>
              )}
              <button onClick={async () => { try { const l = await odaberiLokalnu(); otvori(l, { vrsta: 'lokalno' }); } catch { /* odustao */ } }}>
                Odaberi datoteku
              </button>
              <button onClick={async () => { try { const l = await novaLokalna(zapisiDatoteku(PRAZNO)); otvori(l, { vrsta: 'lokalno' }); } catch { /* odustao */ } }}>
                Nova prazna datoteka
              </button>
              {trebaDozvolu && <button className="tekst-gumb" onClick={() => { zaboraviLokalnu(); zapamtiIzvor(null); setTrebaDozvolu(false); }}>Zaboravi</button>}
            </div>
          </>
        ) : (
          <>
            <p className="muted">Ovaj preglednik ne može spremati izravno u datoteku. Izmjene se spremaju preuzimanjem nove kopije.</p>
            <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && otvori(izvorIzDatoteke(e.target.files[0]))} />
          </>
        )}
      </Kartica>
    </div>
  );
}
