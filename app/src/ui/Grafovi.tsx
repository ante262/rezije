import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { broj, eur, kratkiMjesec, kratkoImeMjeseca } from '../domain/dates';
import { BOJE } from './common';

const os = { stroke: 'var(--muted)', fontSize: 12, tickLine: false } as const;
const fmtOs = (v: number) => (Math.abs(v) >= 1000 ? `${broj(v / 1000, 1)}k` : broj(v));

interface Serija {
  kljuc: string;
  boja: string;
}

function TooltipSadrzaj(props: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[];
  naslov: (l: string | number) => string;
  jedinica?: (v: number) => string;
  ukupno?: boolean;
}) {
  if (!props.active || !props.payload?.length) return null;
  const f = props.jedinica ?? eur;
  const stavke = props.payload.filter((x) => x.value !== undefined && x.value !== null && x.value !== 0);
  const procjena = props.payload[0]?.payload?.procjena;
  return (
    <div className="tooltip">
      <div className="tooltip-naslov">
        {props.naslov(props.label ?? '')}
        {procjena ? <span className="muted"> · procjena</span> : null}
      </div>
      {[...stavke].reverse().map((x) => (
        <div key={x.name} className="tooltip-red">
          <span className="tocka" style={{ background: x.color }} />
          <span>{x.name}</span>
          <span className="br">{f(x.value!)}</span>
        </div>
      ))}
      {props.ukupno && stavke.length > 1 && (
        <div className="tooltip-red ukupno">
          <span />
          <span>Ukupno</span>
          <span className="br">{f(stavke.reduce((a, x) => a + (x.value ?? 0), 0))}</span>
        </div>
      )}
    </div>
  );
}

/** Mjesečni troškovi po grupama (složeni stupci); procijenjeni mjeseci su svjetliji. */
export function MjesecniGraf(props: {
  podaci: ({ mjesec: string; procjena: boolean } & Record<string, number | string | boolean>)[];
  serije: Serija[];
  odabran?: string;
  klik?: (m: string) => void;
  visina?: number;
}) {
  return (
    <div className="graf">
      <ResponsiveContainer width="100%" height={props.visina ?? 280}>
        <BarChart
          data={props.podaci}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="18%"
          onClick={(s) => {
            const l = (s as { activeLabel?: string } | null)?.activeLabel;
            if (l && props.klik) props.klik(l);
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="mjesec" tickFormatter={(m: string) => kratkiMjesec(m)} {...os} axisLine={{ stroke: 'var(--axis)' }} minTickGap={8} />
          <YAxis tickFormatter={fmtOs} {...os} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--hover)' }} content={<TooltipSadrzaj naslov={(l) => kratkiMjesec(String(l))} ukupno />} />
          <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
          {props.serije.map((s, i) => (
            <Bar
              key={s.kljuc}
              dataKey={s.kljuc}
              name={s.kljuc}
              stackId="a"
              fill={s.boja}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === props.serije.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            >
              {props.podaci.map((d) => (
                <Cell
                  key={d.mjesec}
                  fillOpacity={d.procjena ? 0.4 : props.odabran && d.mjesec !== props.odabran ? 0.75 : 1}
                  cursor={props.klik ? 'pointer' : undefined}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Usporedba po mjesecima kroz godine (linija po godini). */
export function GodisnjiGraf(props: {
  podaci: Map<number, Map<number, number>>; // godina -> mjesec -> vrijednost
  jedinica?: (v: number) => string;
  visina?: number;
  procjene?: Map<number, Set<number>>;
}) {
  const godine = [...props.podaci.keys()].sort().slice(-5);
  const red = Array.from({ length: 12 }, (_, i) => {
    const o: Record<string, number | undefined> = { mjesec: i + 1 };
    for (const g of godine) o[String(g)] = props.podaci.get(g)?.get(i + 1);
    return o;
  });
  return (
    <div className="graf">
      <ResponsiveContainer width="100%" height={props.visina ?? 260}>
        <LineChart data={red} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="mjesec" tickFormatter={(m: number) => kratkoImeMjeseca(m)} {...os} axisLine={{ stroke: 'var(--axis)' }} padding={{ left: 12, right: 12 }} />
          <YAxis tickFormatter={fmtOs} {...os} axisLine={false} width={44} />
          <Tooltip
            cursor={{ stroke: 'var(--axis)' }}
            content={<TooltipSadrzaj naslov={(l) => kratkoImeMjeseca(Number(l))} jedinica={props.jedinica} />}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
          {godine.map((g, i) => (
            <Line
              key={g}
              dataKey={String(g)}
              name={String(g)}
              stroke={BOJE[i]}
              strokeWidth={i === godine.length - 1 ? 2.5 : 2}
              dot={{ r: 3, strokeWidth: 0, fill: BOJE[i] }}
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Jedna serija po mjesecima (npr. plaćanja jedne režije). */
export function JednostavniGraf(props: { podaci: { mjesec: string; iznos: number; procjena?: boolean }[]; visina?: number; jedinica?: (v: number) => string }) {
  return (
    <div className="graf">
      <ResponsiveContainer width="100%" height={props.visina ?? 200}>
        <BarChart data={props.podaci} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="mjesec" tickFormatter={(m: string) => kratkiMjesec(m)} {...os} axisLine={{ stroke: 'var(--axis)' }} minTickGap={8} />
          <YAxis tickFormatter={fmtOs} {...os} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--hover)' }} content={<TooltipSadrzaj naslov={(l) => kratkiMjesec(String(l))} jedinica={props.jedinica} />} />
          <Bar dataKey="iznos" name="Iznos" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {props.podaci.map((d) => (
              <Cell key={d.mjesec} fillOpacity={d.procjena ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
