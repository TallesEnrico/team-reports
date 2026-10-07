import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCreatableIssueTypesQuery } from '../../../api/useCreatableIssueTypesQuery';
import { Button } from '../../../components/Button';
import { isParentStoryType } from '../../../lib/parentStoryType';
import { CreateStoryDialog } from './CreateStoryDialog';

interface CreateStoryButtonProps {
  projectKey: string;
  /** Escopo `write:jira-work`. Sem ele, criar issue no Jira não funciona. */
  canWrite: boolean;
}

/**
 * "Criar história" no cabeçalho do quadro. Só aparece quando o Jira lista uma
 * história de nível pai entre os tipos que esta conta pode criar no projeto:
 * em algumas empresas a conta cria subtarefa e não cria história.
 */
export function CreateStoryButton({ projectKey, canWrite }: CreateStoryButtonProps) {
  const typesQuery = useCreatableIssueTypesQuery(projectKey, canWrite);
  const [open, setOpen] = useState(false);
  const storyTypes = (typesQuery.data ?? []).filter(isParentStoryType);
  if (!canWrite || storyTypes.length === 0) return null;

  return (
    <>
      <Button icon={<Plus size={14} weight="bold" />} onClick={() => setOpen(true)} title="Criar uma história nesta squad">
        Criar história
      </Button>
      {open && <CreateStoryDialog projectKey={projectKey} storyTypes={storyTypes} onClose={() => setOpen(false)} />}
    </>
  );
}
