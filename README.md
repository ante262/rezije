# Režije

Aplikacija za praćenje režija, obroka i kredita. Podaci su u jednoj Excel datoteci na OneDriveu. Nema servera ni baze.

- **Aplikacija:** statična PWA (React + Vite) na GitHub Pages. Instalira se iz preglednika na računalu i na mobitelu.
- **Podaci:** `rezije-podaci.xlsx` s listovima Režije, Plaćanja, Očitanja, Cjenici, Vaučeri i Postavke. Aplikacija je čita i sprema preko Microsoft Graph API-ja. Datoteku možeš otvoriti i u Excelu, samo ne mijenjaj naslove stupaca.
- **Na računalu** se može koristiti i bez prijave: u Chromeu ili Edgeu odabereš datoteku u lokalnoj OneDrive mapi i izmjene se spremaju izravno u nju.

## Postavljanje OneDrive pristupa (jednom)

1. Otvori <https://entra.microsoft.com> → **App registrations** → **New registration**.
   - Name: `Režije`
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: platforma **Single-page application (SPA)**, adresa aplikacije, npr. `https://<korisnik>.github.io/rezije/`
2. U **Authentication** dodaj još jedan SPA redirect URI za lokalni razvoj: `http://localhost:5180/`.
3. U **API permissions** dodaj **Microsoft Graph → Delegated → Files.ReadWrite**.
4. Kopiraj **Application (client) ID**. Imaš dvije mogućnosti:
   - upiši ga na početnom ekranu aplikacije (pamti se u pregledniku), ili
   - postavi ga kao GitHub varijablu `MS_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables), pa je ugrađen u aplikaciju.

Registracija je besplatna. Client ID nije tajna; aplikacija pristupa samo OneDriveu računa koji se prijavi.

## Razvoj

```bash
cd app
npm install
npm run dev        # http://localhost:5180
npm test           # testovi izračuna
```

## Jednokratni uvoz iz starog Excela

```bash
cd app
npm run uvoz -- ../Režije.xlsx ../rezije-podaci.xlsx
```

Skripta prebaci sve listove u novi raspored (iznose do 2023. preračuna iz kuna u eure) i usporedi izračun struje i vode s formulama iz starog Excela.

## Kako se računa

- **Struja:** očitanje VT/NT u danu *d* linearno se produži do kraja mjeseca. Potrošnja se množi sa stavkama cjenika koji vrijedi za taj mjesec potrošnje. Svaka stavka se zaokružuje na 2 decimale, zatim se dodaju fiksne naknade i PDV. U mjesecima zatvaranja razdoblja (ožujak i rujan) višak iznad 3000 kWh u zadnjih 6 mjeseci dijeli se na VT i NT u omjeru potrošnje i naplaćuje po cijeni "iznad praga". Vaučer umanjuje iznos, najviše do 0 €.
- **Voda / plin:** razlika dvaju očitanja × cjenik. Stavke se mogu označiti kao "s PDV-om" ili "bez PDV-a".
- **Smeće:** broj odvoza × cijena odvoza + fiksni dio, s PDV-om. Svaki odvoz se upisuje s datumom, a broj odvoza u mjesecu plaća se idući mjesec. Raspored (prvi odvoz + svakih N tjedana) određuje sljedeći odvoz i procjenu. Ako je dan odvoza blagdan ili vikend, odvoz se pomiče na sljedeći radni dan (hrvatski blagdani, uključujući Uskrs i Tijelovo). Promjena dana je novi raspored od novog datuma.
- **Rok i prijava očitanja:** voda je zadano 15.–25., a struja zadnjih 7 dana u mjesecu. Rok se mijenja na režiji ("15-25", "zadnjih 7", "ne"). Crvena oznaka na Pregledu traje dok očitanje u roku nije uneseno i označeno kao prijavljeno (HEP, vodovod). Novo očitanje zamjenjuje postojeće za isti mjesec.
- **Obroci i krediti:** plan otplate (iznos rate, prva rata, broj rata ili datum zadnje rate). Rate se automatski ubrajaju u mjesečni trošak.
- **Procjena za buduće mjesece:** potrošnja iz istog mjeseca prošle godine, uz mogućnost ručnog ispravka. Za obične račune uzima se zadnji iznos.
- **Promjena rate** (npr. APN kredit): od zadanog mjeseca vrijedi novi iznos rate. Može se označiti kao procjena i kasnije ispraviti.
- **Tko plaća:** sve se vodi na tebe. U Postavkama dodaješ druge platitelje (osobe ili račune). Platitelj na režiji vrijedi samo za nova plaćanja i procjene, stara plaćanja se ne mijenjaju. Kod plaćanja biraš "samo ovo plaćanje" ili "ovo i sva sljedeća". Filter u Pregledu i Plaćanjima prikazuje iznose samo za jednog platitelja.
- **Jednokratne kupnje** (npr. drva) vode se odvojeno i ne ulaze u mjesečni trošak.
