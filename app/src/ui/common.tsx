import { useEffect, useState, type ReactNode } from 'react';
import { dodajMjesece, nazivMjeseca } from '../domain/dates';
import type { Podaci } from '../domain/types';
import { useStanje } from '../state';

export function Modal(props: { naslov: string; zatvori: () => void; children: ReactNode; sirok?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.zatvori();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [props]);
  return (
    <div className="modal-pozadina" onMouseDown={(e) => e.target === e.currentTarget && props.zatvori()}>
      <div className={`modal ${props.sirok ? 'modal-sirok' : ''}`} role="dialog" aria-label={props.naslov}>
        <header>
          <h2>{props.naslov}</h2>
          <button className="ikona" onClick={props.zatvori} aria-label="Zatvori">✕</button>
        </header>
        <div className="modal-tijelo">{props.children}</div>
      </div>
    </div>
  );
}

export function Kartica(props: { naslov?: ReactNode; akcije?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`kartica ${props.className ?? ''}`}>
      {(props.naslov || props.akcije) && (
        <header className="kartica-zaglavlje">
          {props.naslov && <h3>{props.naslov}</h3>}
          {props.akcije && <div className="akcije">{props.akcije}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Polje(props: { oznaka: string; children: ReactNode; pomoc?: ReactNode; siroko?: boolean }) {
  return (
    <label className={`polje ${props.siroko ? 'siroko' : ''}`}>
      <span className="oznaka">{props.oznaka}</span>
      {props.children}
      {props.pomoc && <span className="pomoc">{props.pomoc}</span>}
    </label>
  );
}

/** Unos broja koji prihvaća i zarez i točku. */
export function BrojUnos(props: {
  vrijednost: number | undefined;
  promjena: (v: number | undefined) => void;
  korak?: string;
  autoFocus?: boolean;
  placeholder?: string;
  velik?: boolean;
}) {
  const [tekst, setTekst] = useState(props.vrijednost === undefined ? '' : String(props.vrijednost).replace('.', ','));
  useEffect(() => {
    const trenutni = tekst.trim() === '' ? undefined : Number(tekst.replace(',', '.'));
    if (trenutni !== props.vrijednost) setTekst(props.vrijednost === undefined ? '' : String(props.vrijednost).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.vrijednost]);
  return (
    <input
      inputMode="decimal"
      className={props.velik ? 'velik' : undefined}
      value={tekst}
      autoFocus={props.autoFocus}
      placeholder={props.placeholder}
      onChange={(e) => {
        setTekst(e.target.value);
        const t = e.target.value.trim().replace(/\s/g, '').replace(',', '.');
        if (t === '') props.promjena(undefined);
        else if (!Number.isNaN(Number(t))) props.promjena(Number(t));
      }}
    />
  );
}

export function MjesecBirac(props: { mjesec: string; promjena: (m: string) => void; min?: string; max?: string }) {
  return (
    <div className="mjesec-birac">
      <button className="ikona" disabled={!!props.min && props.mjesec <= props.min} onClick={() => props.promjena(dodajMjesece(props.mjesec, -1))} aria-label="Prethodni mjesec">‹</button>
      <span>{nazivMjeseca(props.mjesec)}</span>
      <button className="ikona" disabled={!!props.max && props.mjesec >= props.max} onClick={() => props.promjena(dodajMjesece(props.mjesec, 1))} aria-label="Sljedeći mjesec">›</button>
    </div>
  );
}

export function Oznaka(props: { vrsta: 'placeno' | 'ocekivano' | 'automatski' | 'procjena' | 'neutralno' | 'upozorenje'; children: ReactNode }) {
  const ikona = { placeno: '✓', ocekivano: '◷', automatski: '↻', procjena: '≈', neutralno: '', upozorenje: '!' }[props.vrsta];
  return (
    <span className={`oznaka-status ${props.vrsta}`}>
      {ikona && <span aria-hidden>{ikona}</span>}
      {props.children}
    </span>
  );
}

// ---------------------------------------------------------------- boje grupa

/** Kategorijske boje (fiksni redoslijed); boja prati grupu, ne rang. */
export const BOJE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export function grupe(p: Podaci): string[] {
  const out: string[] = [];
  for (const r of [...p.rezije].sort((a, b) => a.redoslijed - b.redoslijed)) {
    if (r.vrsta === 'jednokratno') continue;
    if (!out.includes(r.grupa)) out.push(r.grupa);
  }
  return out;
}

export function bojaGrupe(p: Podaci, g: string): string {
  const i = grupe(p).indexOf(g);
  return BOJE[i >= 0 && i < BOJE.length ? i : BOJE.length - 1];
}

/** Odabir platitelja za preglede (prikazuje se samo ako su platitelji upisani u postavkama). */
export function PlatiteljFilter() {
  const { podaci, platitelj, setPlatitelj } = useStanje();
  const lista = podaci.postavke.platitelji;
  if (lista.length < 2) return null;
  const opcije: { id: string | null; naziv: string }[] = [{ id: null, naziv: 'Svi' }, ...lista.map((x) => ({ id: x, naziv: x }))];
  return (
    <div className="segment" role="group" aria-label="Platitelj">
      {opcije.map((o) => (
        <button key={o.id ?? '*'} className={platitelj === o.id ? 'aktivno' : ''} onClick={() => setPlatitelj(o.id)}>
          {o.naziv}
        </button>
      ))}
    </div>
  );
}

/** Odabir platitelja u formi. Prazno = zadani platitelj (prvi na popisu). */
export function PlatiteljOdabir(props: { vrijednost?: string; promjena: (v: string | undefined) => void }) {
  const { podaci } = useStanje();
  const [zadani, ...ostali] = podaci.postavke.platitelji;
  const v = props.vrijednost && props.vrijednost !== zadani ? props.vrijednost : '';
  return (
    <select value={v} onChange={(e) => props.promjena(e.target.value || undefined)}>
      <option value="">{zadani} (zadano)</option>
      {ostali.map((x) => (
        <option key={x} value={x}>{x}</option>
      ))}
      {v && !ostali.includes(v) && <option value={v}>{v}</option>}
    </select>
  );
}
