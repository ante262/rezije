/** Datumi su 'YYYY-MM-DD', mjeseci 'YYYY-MM'. Svi iznosi su u eurima. */

export type Vrsta =
  | 'jednostavna' // samo unos plaćenog računa
  | 'voda' // brojilo (m³)
  | 'struja' // brojilo VT/NT
  | 'smece' // broj odvoza
  | 'obrok' // obročna otplata s planom
  | 'kredit' // kredit s planom
  | 'jednokratno'; // kupnje koje se ne broje u mjesečne režije

export const VRSTE: { id: Vrsta; naziv: string }[] = [
  { id: 'jednostavna', naziv: 'Mjesečni račun' },
  { id: 'struja', naziv: 'Struja (VT/NT brojilo)' },
  { id: 'voda', naziv: 'Brojilo (npr. voda, plin)' },
  { id: 'smece', naziv: 'Po broju odvoza' },
  { id: 'obrok', naziv: 'Obročna otplata' },
  { id: 'kredit', naziv: 'Kredit' },
  { id: 'jednokratno', naziv: 'Jednokratna kupnja' },
];

export interface Rezija {
  id: string;
  naziv: string;
  vrsta: Vrsta;
  grupa: string;
  aktivna: boolean;
  redoslijed: number;
  /** obrok/kredit: plan otplate */
  iznosRate?: number;
  prvaRata?: string;
  brojRata?: number;
  zadnjaRata?: string;
  /** dan u mjesecu kad se plaća (obrok/kredit i očekivani datum za ostale) */
  danPlacanja?: number;
  /** tko obično plaća (ime iz postavki); prazno = različito / zajedničko */
  platitelj?: string;
  /** rok za očitanje u mjesecu: "15-25", "zadnjih 7" ili "ne"; prazno = zadano za vrstu */
  rokOcitanja?: string;
  /** kome se prijavljuje očitanje (npr. HEP, vodovod) */
  prijavaKome?: string;
  napomena?: string;
}

export interface Placanje {
  id: string;
  datum: string;
  rezijaId: string;
  /** razdoblje na koje se račun odnosi (npr. potrošnja struje za listopad) */
  zaMjesec?: string;
  /** stvarno plaćeno (nakon vaučera) */
  iznos: number;
  /** iznos računa prije vaučera */
  racun?: number;
  vauceri?: number;
  naknada?: number;
  /** tko je platio; prazno = kao zadano na režiji */
  platitelj?: string;
  napomena?: string;
}

export type VrstaOcitanja =
  | 'ocitanje' // stanje brojila (struja: VT + NT)
  | 'zamjena' // zamjena brojila: završno stanje starog brojila, novo kreće od 0
  | 'korekcija' // ručno postavljeno stanje na kraju mjeseca (umjesto procjene)
  | 'odvozi' // broj odvoza smeća za mjesec (stari unos)
  | 'odvoz' // jedan odvoz smeća na datum
  | 'procjena'; // ručno ispravljena procjena potrošnje za budući mjesec

export interface Ocitanje {
  id: string;
  rezijaId: string;
  datum: string;
  vrsta: VrstaOcitanja;
  /** VT / stanje / broj odvoza / procijenjena potrošnja */
  vrijednost: number;
  /** NT (samo struja) */
  nt?: number;
  /** očitanje je prijavljeno distributeru (HEP, vodovod) */
  prijavljeno?: boolean;
  napomena?: string;
}

/** Raspored odvoza: od prvog odvoza svakih N tjedana (vrijedi do sljedećeg rasporeda). */
export interface Raspored {
  id: string;
  rezijaId: string;
  /** datum prvog odvoza po ovom rasporedu (određuje i dan u tjednu) */
  prviOdvoz: string;
  svakihTjedana: number;
  napomena?: string;
}

export type Osnovica = 'vt' | 'nt' | 'kolicina' | 'fiksno' | 'pdv';

export interface StavkaCjenika {
  id: string;
  rezijaId: string;
  /** mjesec potrošnje od kojeg cjenik vrijedi */
  vrijediOd: string;
  stavka: string;
  osnovica: Osnovica;
  cijena: number;
  /** struja: cijena za dio potrošnje iznad praga (npr. 3000 kWh u 6 mjeseci) */
  cijenaIznadPraga?: number;
  /** ulazi u osnovicu za PDV */
  uPdv: boolean;
  /** zaokruži stavku na 2 decimale prije zbrajanja */
  zaokruzi: boolean;
}

export interface Vaucer {
  id: string;
  rezijaId: string;
  vrijediOd: string;
  vrijediDo?: string;
  iznos: number;
  komadaMjesecno: number;
}

/** Promjena iznosa rate od nekog mjeseca (npr. APN kredit nakon razdoblja subvencije). */
export interface PromjenaRate {
  id: string;
  rezijaId: string;
  /** mjesec prve rate s novim iznosom */
  vrijediOd: string;
  iznos: number;
  /** iznos još nije poznat, upisana je procjena */
  procjena?: boolean;
  napomena?: string;
}

export interface Postavke {
  /** prag potrošnje struje u kWh za razdoblje */
  strujaPrag: number;
  /** mjeseci u kojima se zatvara razdoblje praga (npr. 3 i 9) */
  strujaPragMjeseci: number[];
  /** broj mjeseci razdoblja praga */
  strujaPragTrajanje: number;
  /** imena platitelja (npr. članovi kućanstva ili računi) */
  platitelji: string[];
}

export const ZADANE_POSTAVKE: Postavke = {
  strujaPrag: 3000,
  strujaPragMjeseci: [3, 9],
  strujaPragTrajanje: 6,
  platitelji: [],
};

export interface Podaci {
  rezije: Rezija[];
  placanja: Placanje[];
  ocitanja: Ocitanje[];
  cjenici: StavkaCjenika[];
  vauceri: Vaucer[];
  promjeneRata: PromjenaRate[];
  rasporedi: Raspored[];
  postavke: Postavke;
}
