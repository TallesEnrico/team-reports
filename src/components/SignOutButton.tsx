import { SignOut } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './Button';
import { clearAtlassianOAuthCookie } from '../features/jira-connection/lib/atlassianOAuth';
import { useJiraConnectionStore } from '../store/useJiraConnectionStore';

interface SignOutButtonProps {
  iconOnly?: boolean;
  className?: string;
}

export function SignOutButton({ iconOnly = false, className }: SignOutButtonProps) {
  const credentials = useJiraConnectionStore((state) => state.credentials);
  const disconnect = useJiraConnectionStore((state) => state.disconnect);
  const queryClient = useQueryClient();

  if (!credentials) return null;

  async function handleDisconnect() {
    const confirmed = window.confirm(
      'Sair desta conta? O acesso salvo neste navegador será apagado e o assistente de conexão abrirá de novo.',
    );
    if (!confirmed) return;
    clearAtlassianOAuthCookie();
    await disconnect();
    queryClient.clear();
  }

  return (
    <Button
      variant="ghost"
      className={className}
      icon={<SignOut size={iconOnly ? 18 : 16} weight="bold" />}
      title={iconOnly ? 'Sair' : undefined}
      aria-label={iconOnly ? 'Sair' : undefined}
      onClick={() => void handleDisconnect()}
    >
      {iconOnly ? undefined : 'Sair'}
    </Button>
  );
}
