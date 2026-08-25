export type Row = Record<string, any>;

export type BadgeTone =
  | 'blue'
  | 'green'
  | 'red'
  | 'yellow'
  | 'gray'
  | 'purple'
  | 'cyan';

export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'textarea'
  | 'password'
  | 'email'
  | 'url'
  | 'json'
  | 'checkbox'
  | 'items'
  | 'searchSelect';

export interface FormField {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: any;
  full?: boolean;
  hint?: string;
  optionsFrom?: {
    endpoint: string;
    valueKey?: string;
    labelKeys?: string[];
    emptyValue?: string;
  };
}

export interface Column {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
  badge?: boolean | ((value: any, row: Row) => BadgeTone);
}

export interface Action {
  label: string;
  onClick: (row: Row) => void;
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
  condition?: (row: Row) => boolean;
  skipReload?: boolean;
}

export type ApiResponse<T = any> = {
  success: boolean;
  data: T;
  meta?: any;
};

export interface ListPayload<T = Row> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
