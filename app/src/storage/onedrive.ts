import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { SukobVerzija, type Izvor } from './izvor';

/**
 * OneDrive preko Microsoft Graph API-ja.
 * Potreban je Client ID besplatne registracije aplikacije (Microsoft Entra, osobni račun).
 */
const SCOPES = ['Files.ReadWrite'];
const KLJUC_CLIENT_ID = 'rezije.clientId';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export const clientId = () => localStorage.getItem(KLJUC_CLIENT_ID) || import.meta.env.VITE_MS_CLIENT_ID || '';
export const postaviClientId = (id: string) => localStorage.setItem(KLJUC_CLIENT_ID, id.trim());
export const redirectUri = () => window.location.origin + import.meta.env.BASE_URL;

let pca: PublicClientApplication | undefined;
let inicijalizacija: Promise<AccountInfo | null> | undefined;

/** Inicijalizira MSAL i obradi povratak s Microsoftove prijave. Vraća prijavljeni račun. */
export function prijavljeniRacun(): Promise<AccountInfo | null> {
  if (!clientId()) return Promise.resolve(null);
  inicijalizacija ??= (async () => {
    pca = new PublicClientApplication({
      auth: { clientId: clientId(), authority: 'https://login.microsoftonline.com/consumers', redirectUri: redirectUri() },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    const rez = await pca.handleRedirectPromise();
    if (rez?.account) pca.setActiveAccount(rez.account);
    const acc = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
    if (acc) pca.setActiveAccount(acc);
    return acc;
  })();
  return inicijalizacija;
}

export async function prijava(): Promise<void> {
  await prijavljeniRacun();
  await pca!.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

export async function odjava(): Promise<void> {
  await prijavljeniRacun();
  await pca?.logoutRedirect({ postLogoutRedirectUri: redirectUri() });
}

async function token(): Promise<string> {
  const acc = await prijavljeniRacun();
  if (!pca || !acc) throw new Error('Nisi prijavljen u Microsoft račun.');
  try {
    return (await pca.acquireTokenSilent({ scopes: SCOPES, account: acc })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await pca.acquireTokenRedirect({ scopes: SCOPES, account: acc });
    }
    throw e;
  }
}

const putanjaUrl = (putanja: string) =>
  `${GRAPH}/me/drive/root:${putanja.split('/').map(encodeURIComponent).join('/')}:`;

async function graph(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` } });
  if (res.status === 412) throw new SukobVerzija();
  if (!res.ok) {
    const tekst = await res.text().catch(() => '');
    if (res.status === 404) throw new Error(`Datoteka nije pronađena na OneDriveu.`);
    throw new Error(`OneDrive greška ${res.status}: ${tekst.slice(0, 200)}`);
  }
  return res;
}

export function onedriveIzvor(putanja: string): Izvor {
  let eTag: string | undefined;
  return {
    vrsta: 'onedrive',
    opis: `OneDrive: ${putanja}`,
    async ucitaj() {
      const meta = await (await graph(putanjaUrl(putanja))).json();
      eTag = meta.eTag;
      return (await graph(`${putanjaUrl(putanja)}/content`)).arrayBuffer();
    },
    async spremi(data) {
      const res = await graph(`${putanjaUrl(putanja)}/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ...(eTag ? { 'If-Match': eTag } : {}),
        },
        body: data,
      });
      eTag = (await res.json()).eTag;
    },
  };
}

/** Popis .xlsx datoteka u mapi (za odabir datoteke). */
export async function xlsxUMapi(mapa: string): Promise<{ naziv: string; putanja: string }[]> {
  const url = mapa === '/' || mapa === '' ? `${GRAPH}/me/drive/root/children` : `${putanjaUrl(mapa)}/children`;
  const json = await (await graph(`${url}?$select=name,folder,file&$top=200`)).json();
  return (json.value as { name: string; folder?: unknown }[])
    .filter((x) => x.folder || x.name.toLowerCase().endsWith('.xlsx'))
    .map((x) => ({ naziv: x.folder ? `${x.name}/` : x.name, putanja: `${mapa.replace(/\/$/, '')}/${x.name}` }));
}

/** Napravi novu datoteku (npr. prazan predložak) na OneDriveu. */
export async function napraviNaOneDriveu(putanja: string, data: ArrayBuffer): Promise<void> {
  await graph(`${putanjaUrl(putanja)}/content?@microsoft.graph.conflictBehavior=fail`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: data,
  });
}
