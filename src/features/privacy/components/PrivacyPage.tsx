import { Link } from 'react-router';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import styles from './PrivacyPage.module.css';

const UPDATED = '6 de outubro de 2026';

export function PrivacyPage() {
  useDocumentTitle('Privacidade');

  return (
    <main className={styles.page}>
      <article className={styles.sheet}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Time</p>
          <h1 className={styles.title}>Privacidade</h1>
          <p className={styles.lead}>
            O Team Reportss mostra horas, quadro, indicadores e dashboards a partir do Jira da pessoa que entrou. Esta página
            diz quais dados da conta Atlassian entram nisso, onde ficam e por quanto tempo.
          </p>
          <p className={styles.updated}>Atualizado em {UPDATED}</p>
        </header>

        <section className={styles.section}>
          <h2>Quem responde por este app</h2>
          <p>
            O Team Reportss é uma ferramenta interna do Time. O acesso ao Jira acontece com a conta Atlassian de
            quem usa o app. Não há cadastro separado.
          </p>
        </section>

        <section className={styles.section}>
          <h2>O que é guardado</h2>
          <p>Depois do login com a Atlassian, o navegador guarda, criptografado:</p>
          <ul>
            <li>identificador da conta (Account ID), nome e e-mail devolvidos pelo Jira;</li>
            <li>o acesso temporário da Atlassian, que expira em cerca de uma hora;</li>
            <li>o site do Jira (domínio e Cloud ID) e a squad escolhida.</li>
          </ul>
          <p>
            Horas, issues e quadros são lidos no Jira para montar a tela. Essa consulta não vira um banco de pessoas no
            Team Reportss.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Onde fica</h2>
          <p>
            No próprio navegador, no IndexedDB, cifrado. Sai com a pessoa quando ela clica em Sair. Outro computador, ou
            outro navegador, começa sem esses dados.
          </p>
          <p>
            O servidor do Team Reportss só completa o login com a Atlassian, porque essa etapa precisa de um segredo que não
            pode ir para o navegador. Ele não grava conta, token, Cloud ID nem histórico. Não há sessão no servidor. Quando
            o acesso expira, a pessoa entra de novo.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Atlassian e Jira</h2>
          <p>
            O app pede permissão para ler usuário, trabalho, projetos e quadros do Jira, e para registrar trabalho. As
            chamadas vão para a Atlassian com o acesso de quem autorizou. A política da Atlassian vale para o que permanece
            no Jira.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Entre dispositivos</h2>
          <p>
            Quem liga “Conexões entre dispositivos” envia nome, e-mail e o que escolher compartilhar (dashboard ou
            relatório) direto para outro navegador do mesmo site Jira. Isso não passa por um banco do Team Reportss. Dá para
            recusar o recebimento e bloquear um remetente.
          </p>
        </section>

        <section className={styles.section}>
          <h2>O que não fazemos</h2>
          <ul>
            <li>não vendemos esses dados e não os mandamos para anunciantes;</li>
            <li>não guardamos o acesso da Atlassian num servidor;</li>
            <li>não pedimos senha do Jira nem token de API para o login com a Atlassian.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Apagar</h2>
          <p>
            Sair remove a conta salva neste navegador. Apagar os dados do site nas configurações do navegador também
            remove o que ficou cifrado aqui.
          </p>
        </section>

        <footer className={styles.footer}>
          <p>Dúvidas sobre estes dados: fale com quem administra o Team Reportss no Time.</p>
          <Link to="/" className={styles.back}>
            Voltar ao início
          </Link>
        </footer>
      </article>
    </main>
  );
}
