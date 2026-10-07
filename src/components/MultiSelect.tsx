import Select, { type GroupBase, type Props as SelectProps } from 'react-select';

type MultiSelectProps<Option> = Omit<SelectProps<Option, true, GroupBase<Option>>, 'isMulti' | 'unstyled' | 'classNamePrefix'>;

/** react-select múltiplo com o visual do projeto (classes `.ms__*` em styles/global.css). */
export function MultiSelect<Option>(props: MultiSelectProps<Option>) {
  return (
    <Select<Option, true, GroupBase<Option>>
      isMulti
      unstyled
      classNamePrefix="ms"
      // Portal para o menu não ser cortado pelo scroll do painel lateral. Dentro de um <dialog> modal,
      // passe `menuPortalTarget={null}`: um menu no <body> ficaria atrás do diálogo e sem clique.
      menuPortalTarget={document.body}
      // O z-index do portal vem do emotion; só o prop `styles` o sobrescreve de forma confiável.
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 50 }) }}
      closeMenuOnSelect={false}
      loadingMessage={() => 'Carregando…'}
      noOptionsMessage={() => 'Nenhuma opção'}
      {...props}
    />
  );
}
