/** Shared types for the Maitri Assistant panel components (spec 26). */
export interface ConversationItem {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  state?: 'active' | 'done' | 'error';
  navigateTo?: string;
  navigateLabel?: string;
  /** Prefilled create-form handoff for the target HMS screen (spec 15). */
  formHandoff?: { module: string; fields: Record<string, unknown> };
  confirm?: {
    toolCallId: string;
    message: string;
  };
}
