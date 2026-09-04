'use client';

import EntityPage from './EntityPage';
import type { Column, FormField, Action, Row } from '@/lib/types';

interface ModulePageProps {
  title: string;
  subtitle?: string;
  endpoint?: string;
  columns?: Column[];
  fields?: FormField[];
  createLabel?: string;
  createRoles?: string[];
  actions?: Action[];
  searchable?: boolean;
  tabs?: {
    key: string;
    label: string;
    endpoint?: string;
    columns?: Column[];
    fields?: FormField[];
    createLabel?: string;
    createRoles?: string[];
    editable?: boolean;
    actions?: Action[];
    render?: () => React.ReactNode;
  }[];
  extra?: (reload: () => void) => React.ReactNode;
  headerActions?: (reload: () => void) => React.ReactNode;
  detailHref?: (row: Row) => string | undefined;
  initialTab?: string;
  initialCreateValues?: Record<string, any>;
  autoOpenCreate?: boolean;
}

export default function ModulePage(props: ModulePageProps) {
  return <EntityPage {...props} />;
}
