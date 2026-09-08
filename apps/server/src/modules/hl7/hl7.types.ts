export interface Hl7Field {
  reps: string[][];
}

export interface Hl7Segment {
  name: string;
  fields: Hl7Field[];
  field(index: number): string[][];
  component(index: number, repIndex?: number, compIndex?: number): string | undefined;
  text(index: number): string | undefined;
}

export interface ParsedHl7Message {
  messageType: string;
  eventType: string;
  messageControlId: string;
  version: string;
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  raw: string;
  segment(name: string): Hl7Segment | undefined;
  allSegments(name: string): Hl7Segment[];
}

export type Hl7ActionType =
  | "PATIENT_UPSERTED"
  | "RADIOLOGY_ORDER_CREATED"
  | "RADIOLOGY_ORDER_SCHEDULED"
  | "RADIOLOGY_ORDER_REPORTED"
  | "LAB_ORDER_REPORTED"
  | "APPOINTMENT_SCHEDULED"
  | "IGNORED"
  | "ERROR";

export interface Hl7Action {
  type: Hl7ActionType;
  entityId?: string;
  created?: boolean;
  detail?: string;
}

export interface Hl7ProcessResult {
  accepted: boolean;
  messageType: string;
  eventType: string;
  messageControlId: string;
  version: string;
  tenantId?: string;
  actions: Hl7Action[];
}

export interface Hl7ProcessOptions {
  tenantId?: string;
  userId?: string;
}

export interface Hl7ListenerConfig {
  host?: string;
  port?: number;
  enabled?: boolean;
}