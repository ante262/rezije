import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { sveSerije, type FilterPlatitelja, type MjesecPotrosnje } from './domain/calc';
import { danas, mjesec } from './domain/dates';
import type { Podaci } from './domain/types';
import { citajDatoteku, zapisiDatoteku } from './domain/workbook';
import type { Izvor } from './storage/izvor';
import { preuzmi } from './storage/lokalno';

type Status = { vrsta: 'spremno' } | { vrsta: 'spremanje' } | { vrsta: 'greska'; poruka: string } | { vrsta: 'nespremljeno' };

interface Stanje {
  podaci: Podaci;
  izvor: Izvor;
  status: Status;
  sada: string;
  serije: Map<string, MjesecPotrosnje[]>;
  /** koliko mjeseci unaprijed se procjenjuje */
  unaprijed: number;
  setUnaprijed: (n: number) => void;
  /** odabrani platitelj u pregledima (null = svi) */
  platitelj: FilterPlatitelja;
  setPlatitelj: (f: FilterPlatitelja) => void;
  /** primijeni izmjenu i spremi datoteku */
  izmijeni: (fn: (p: Podaci) => Podaci) => Promise<void>;
  ponovnoUcitaj: () => Promise<void>;
  preuzmiKopiju: () => void;
  zatvori: () => void;
}

const KLJUC_FILTERA = 'rezije.platitelj';
const KLJUC_UNAPRIJED = 'rezije.unaprijed';

const Ctx = createContext<Stanje | null>(null);

export function useStanje(): Stanje {
  const s = useContext(Ctx);
  if (!s) throw new Error('nema stanja');
  return s;
}

export const noviId = (prefiks: string) => `${prefiks}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

export async function ucitajIzvor(izvor: Izvor): Promise<Podaci> {
  return citajDatoteku(await izvor.ucitaj());
}

export function StanjeProvider(props: { izvor: Izvor; pocetni: Podaci; zatvori: () => void; children: ReactNode }) {
  const [podaci, setPodaci] = useState(props.pocetni);
  const [status, setStatus] = useState<Status>({ vrsta: 'spremno' });
  const zadnji = useRef(props.pocetni);
  const red = useRef(Promise.resolve());
  const sada = mjesec(danas());

  const izmijeni = useCallback(
    (fn: (p: Podaci) => Podaci) => {
      const novi = fn(zadnji.current);
      zadnji.current = novi;
      setPodaci(novi);
      // spremanja idu jedno za drugim
      red.current = red.current.then(async () => {
        setStatus({ vrsta: 'spremanje' });
        try {
          if (props.izvor.vrsta === 'preuzimanje') {
            setStatus({ vrsta: 'nespremljeno' });
            return;
          }
          await props.izvor.spremi(zapisiDatoteku(zadnji.current));
          setStatus({ vrsta: 'spremno' });
        } catch (e) {
          setStatus({ vrsta: 'greska', poruka: e instanceof Error ? e.message : String(e) });
        }
      });
      return red.current;
    },
    [props.izvor],
  );

  const ponovnoUcitaj = useCallback(async () => {
    const p = await ucitajIzvor(props.izvor);
    zadnji.current = p;
    setPodaci(p);
    setStatus({ vrsta: 'spremno' });
  }, [props.izvor]);

  const [unaprijed, setUnaprijedStanje] = useState(() => Number(localStorage.getItem(KLJUC_UNAPRIJED)) || 6);
  const setUnaprijed = useCallback((n: number) => {
    setUnaprijedStanje(n);
    localStorage.setItem(KLJUC_UNAPRIJED, String(n));
  }, []);
  const serije = useMemo(() => sveSerije(podaci, sada, unaprijed), [podaci, sada, unaprijed]);
  const [filter, setFilter] = useState<FilterPlatitelja>(() => {
    const v = localStorage.getItem(KLJUC_FILTERA);
    return v === null ? null : v;
  });
  const setPlatitelj = useCallback((f: FilterPlatitelja) => {
    setFilter(f);
    if (f === null) localStorage.removeItem(KLJUC_FILTERA);
    else localStorage.setItem(KLJUC_FILTERA, f);
  }, []);
  // filter za platitelja kojeg više nema u postavkama
  const platitelj = filter !== null && podaci.postavke.platitelji.includes(filter) ? filter : null;

  const vrijednost: Stanje = {
    podaci, izvor: props.izvor, status, sada, serije, izmijeni, ponovnoUcitaj, platitelj, setPlatitelj, unaprijed, setUnaprijed,
    preuzmiKopiju: () => {
      preuzmi(zapisiDatoteku(zadnji.current));
      if (props.izvor.vrsta === 'preuzimanje') setStatus({ vrsta: 'spremno' });
    },
    zatvori: props.zatvori,
  };
  return <Ctx.Provider value={vrijednost}>{props.children}</Ctx.Provider>;
}
