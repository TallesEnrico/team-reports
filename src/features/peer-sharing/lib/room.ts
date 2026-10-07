/**
 * Identifica o app na rede de descoberta (relays Nostr públicos): salas de
 * outros apps com o mesmo nome não se misturam com as nossas.
 */
export const PEER_APP_ID = 'teamreports.peer-sharing';

/** "gmail.com.br" em teste@gmail.com.br; `null` se não é um e-mail. */
export function emailDomain(email: string): string | null {
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email.trim().toLowerCase());
  return match ? match[1] : null;
}

/**
 * A sala de quem usa o mesmo Jira: só o Cloud ID ("2bc8dd13-…"). O domínio do
 * e-mail não entra na chave nem no handshake: qualquer domínio entra. O
 * endereço da página não entra: localhost, o túnel e o app publicado se
 * encontram. Todos nela podem se conectar.
 */
export function roomIdFor(cloudId: string): string | null {
  const client = cloudId.trim().toLowerCase();
  return client || null;
}
