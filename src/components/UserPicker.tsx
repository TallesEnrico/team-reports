import { UserCircleMinus } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import type { JiraUser } from '../api/jira-users';
import { useCurrentUserQuery } from '../api/useCurrentUserQuery';
import { USER_SEARCH_MIN_LENGTH, type UserSource, useUserOptionsQuery } from '../api/useUserOptionsQuery';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Avatar } from './Avatar';
import { SingleSelect } from './SingleSelect';
import styles from './UserPicker.module.css';

interface UserOption {
  value: string;
  label: string;
  /** `null`: a opção "Sem responsável". */
  user: JiraUser | null;
}

interface UserPickerProps {
  inputId?: string;
  /** Nome do campo para leitores de tela, quando não há um <label> (ex: edição no lugar). */
  ariaLabel?: string;
  source: UserSource;
  /** `null`: ninguém (com `allowNone`, a opção "Sem responsável"). */
  value: JiraUser | null;
  onChange: (user: JiraUser | null) => void;
  /** Oferece "Sem responsável". */
  allowNone?: boolean;
  /** Edição no lugar: abre focado e com a lista aberta. */
  autoFocus?: boolean;
  isDisabled?: boolean;
  onBlur?: () => void;
  /** Esc com a lista fechada (ex: sair da edição no lugar); com ela aberta, o Esc só fecha a lista. */
  onEscape?: () => void;
}

const NONE_OPTION: UserOption = { value: 'none', label: 'Sem responsável', user: null };

function toOption(user: JiraUser): UserOption {
  return { value: user.accountId, label: user.displayName, user };
}

/**
 * Escolha de uma pessoa do Jira (responsável, relator). A busca é feita no Jira
 * enquanto se digita; sem busca, "Sem responsável" (se vale) e você vêm primeiro.
 * Sem portal: dentro do modal, um menu no <body> ficaria atrás dele.
 */
export function UserPicker({
  inputId,
  ariaLabel,
  source,
  value,
  onChange,
  allowNone = false,
  autoFocus = false,
  isDisabled = false,
  onBlur,
  onEscape,
}: UserPickerProps) {
  const [input, setInput] = useState('');
  const isMenuOpen = useRef(autoFocus);
  const debouncedInput = useDebouncedValue(input, 300);
  const search = useUserOptionsQuery(source, debouncedInput);
  const { data: me } = useCurrentUserQuery();
  const needsMoreLetters = source.kind === 'any' && input.trim().length < USER_SEARCH_MIN_LENGTH;

  const shortcuts: UserOption[] = [];
  if (!input.trim()) {
    if (allowNone) shortcuts.push(NONE_OPTION);
    if (me) shortcuts.push({ ...toOption(me), label: `${me.displayName} (você)` });
  }
  const shortcutIds = new Set(shortcuts.map((option) => option.value));
  const found = needsMoreLetters ? [] : (search.data ?? []);
  const options = [...shortcuts, ...found.filter((user) => !shortcutIds.has(user.accountId)).map(toOption)];
  const selected = value ? toOption(value) : allowNone ? NONE_OPTION : null;

  return (
    <SingleSelect<UserOption>
      inputId={inputId}
      aria-label={ariaLabel}
      placeholder={source.kind === 'any' ? 'Digite o nome' : 'Escolha a pessoa'}
      options={options}
      value={selected}
      onChange={(option) => option && onChange(option.user)}
      // A busca é feita pelo Jira.
      filterOption={null}
      inputValue={input}
      onInputChange={(next, meta) => {
        if (meta.action === 'input-change') setInput(next);
        if (meta.action === 'menu-close' || meta.action === 'input-blur' || meta.action === 'set-value') setInput('');
      }}
      isLoading={!needsMoreLetters && search.isFetching}
      isDisabled={isDisabled}
      autoFocus={autoFocus}
      defaultMenuIsOpen={autoFocus}
      openMenuOnFocus
      menuPlacement="auto"
      onBlur={onBlur}
      onMenuOpen={() => (isMenuOpen.current = true)}
      onMenuClose={() => (isMenuOpen.current = false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isMenuOpen.current || !onEscape) return;
        // Também impede o Esc de fechar o modal em volta.
        event.preventDefault();
        onEscape();
      }}
      noOptionsMessage={() =>
        needsMoreLetters ? `Digite ao menos ${USER_SEARCH_MIN_LENGTH} letras` : search.isError ? 'Não foi possível buscar' : 'Ninguém com esse nome'
      }
      formatOptionLabel={(option) =>
        option.user ? (
          <span className={styles.person}>
            <Avatar src={option.user.avatarUrl} name={option.user.displayName} size={18} />
            <span className={styles.name}>{option.label}</span>
          </span>
        ) : (
          <span className={styles.person}>
            <UserCircleMinus size={18} className={styles.noneIcon} aria-hidden />
            <span className={styles.name}>{option.label}</span>
          </span>
        )
      }
    />
  );
}
