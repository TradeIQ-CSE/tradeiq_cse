import { CompanySearch, type CompanySearchProps } from "../markets/CompanySearch";

/** Trading forms retain the labelled, required symbol field. */
export function SymbolPicker(props: Omit<CompanySearchProps, "variant">) {
  return <CompanySearch {...props} />;
}
