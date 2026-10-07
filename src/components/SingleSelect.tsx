import Select, { type GroupBase, type Props as SelectProps } from 'react-select';

type SingleSelectProps<Option> = Omit<SelectProps<Option, false, GroupBase<Option>>, 'isMulti' | 'unstyled' | 'classNamePrefix'>;

/**
 * react-select de escolha única com o visual do projeto (classes `.ms__*`).
 * Sem portal por padrão: dentro de um <dialog> modal, um menu no <body> ficaria
 * atrás do diálogo e sem clique.
 */
export function SingleSelect<Option>(props: SingleSelectProps<Option>) {
  return (
    <Select<Option, false, GroupBase<Option>>
      unstyled
      classNamePrefix="ms"
      loadingMessage={() => 'Carregando…'}
      noOptionsMessage={() => 'Nenhuma opção'}
      {...props}
    />
  );
}
