import { useState } from 'react';
import type { EpicOption } from '../../../api/jira-issues';
import { useEpicOptionsQuery } from '../../../api/useEpicOptionsQuery';
import { SingleSelect } from '../../../components/SingleSelect';
import styles from './EpicPicker.module.css';

interface EpicChoice {
  value: string;
  label: string;
  epic: EpicOption;
}

interface EpicPickerProps {
  projectKey: string;
  inputId?: string;
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  isDisabled?: boolean;
  isClearable?: boolean;
  autoFocus?: boolean;
}

function toChoice(epic: EpicOption): EpicChoice {
  return { value: epic.key, label: `${epic.key} ${epic.summary}`, epic };
}

/** Épico aberto da squad. A busca é no Jira, pelo resumo ou pela chave. */
export function EpicPicker({ projectKey, inputId, value, onChange, isDisabled, isClearable, autoFocus }: EpicPickerProps) {
  const [input, setInput] = useState('');
  const search = useEpicOptionsQuery(projectKey, input, !isDisabled);
  const options = (search.data ?? []).map(toChoice);
  const selected = value ? toChoice(value) : null;

  return (
    <SingleSelect<EpicChoice>
      inputId={inputId}
      placeholder="Busque pelo nome ou pela chave"
      options={options}
      value={selected}
      onChange={(option) => onChange(option?.epic ?? null)}
      filterOption={null}
      inputValue={input}
      onInputChange={(next, meta) => {
        if (meta.action === 'input-change') setInput(next);
        if (meta.action === 'menu-close' || meta.action === 'input-blur' || meta.action === 'set-value') setInput('');
      }}
      isLoading={search.isFetching}
      isDisabled={isDisabled}
      isClearable={isClearable}
      autoFocus={autoFocus}
      menuPlacement="auto"
      noOptionsMessage={() => (search.isError ? 'Não foi possível buscar os épicos' : 'Nenhum épico aberto')}
      formatOptionLabel={(option) => (
        <span className={styles.epic}>
          <span className={styles.key}>{option.epic.key}</span>
          <span className={styles.summary}>{option.epic.summary}</span>
        </span>
      )}
    />
  );
}
