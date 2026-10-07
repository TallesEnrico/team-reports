let baseTitle = typeof document === 'undefined' ? '' : document.title;
let badge = 0;
let alert: string | null = null;

function render() {
  if (alert) {
    document.title = alert;
    return;
  }
  document.title = badge > 0 ? `(${badge}) ${baseTitle}` : baseTitle;
}

/** O título da tela aberta, sem o aviso. */
export function setBaseTitle(title: string) {
  baseTitle = title;
  render();
}

/** Quantos avisos esperam: aparece como "(N)" antes do título. */
export function setTitleBadge(count: number) {
  badge = Math.max(0, count);
  render();
}

/** Um texto que toma o lugar do título enquanto existir (o piscar da aba em segundo plano). */
export function setTitleAlert(text: string | null) {
  alert = text;
  render();
}
