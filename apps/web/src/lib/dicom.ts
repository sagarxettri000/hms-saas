import { API_URL } from './api';

function getToken(): { token: string | null; tenantId: string | null } {
  if (typeof window === 'undefined') return { token: null, tenantId: null };
  return {
    token: window.localStorage.getItem('accessToken'),
    tenantId: window.localStorage.getItem('tenantId'),
  };
}

function authHeaders(json = false): Record<string, string> {
  const { token, tenantId } = getToken();
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  if (tenantId && tenantId !== '') h['X-Tenant-ID'] = tenantId;
  return h;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: authHeaders(true) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface DicomStudyListItem {
  id: string;
  studyInstanceUid: string;
  patientId: string | null;
  radiologyOrderId: string | null;
  studyDate: string | null;
  studyDescription: string | null;
  accessionNumber: string | null;
  modality: string | null;
  bodyPart: string | null;
  referringPhysician: string | null;
  institutionName: string | null;
  numberOfSeries: number;
  numberOfInstances: number;
  uploadedBy: string | null;
  createdAt: string;
  patient?: { id: string; firstName: string | null; lastName: string | null; mrn: string | null } | null;
  series?: DicomSeriesListItem[];
}

export interface DicomSeriesListItem {
  id: string;
  seriesInstanceUid: string;
  seriesNumber: number | null;
  modality: string | null;
  seriesDescription: string | null;
  numberOfInstances: number;
}

export interface DicomInstanceListItem {
  id: string;
  sopInstanceUid: string;
  instanceNumber: number | null;
  rows: number | null;
  columns: number | null;
  bitsAllocated: number | null;
  transferSyntax: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface DicomStudyDetail extends DicomStudyListItem {
  series: (DicomSeriesListItem & { instances: DicomInstanceListItem[] })[];
}

export interface DicomUploadFileInfo {
  study: { id: string; studyInstanceUid: string };
  series: { id: string; seriesInstanceUid: string };
  instance: { id: string; sopInstanceUid: string };
  patientName?: string;
  patientId?: string;
}

export interface DicomUploadResult {
  ingested: DicomUploadFileInfo[];
}

export function wadoUrl(studyId: string, instanceId: string): string {
  return `${API_URL}/dicom/studies/${studyId}/instances/${instanceId}/wado`;
}

export function authBeforeSend(xhr: XMLHttpRequest): void {
  const { token, tenantId } = getToken();
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  if (tenantId && tenantId !== '') xhr.setRequestHeader('X-Tenant-ID', tenantId);
}

export const dicomApi = {
  async upload(files: File[], patientId?: string, radiologyOrderId?: string): Promise<DicomUploadResult> {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    if (patientId) form.append('patientId', patientId);
    if (radiologyOrderId) form.append('radiologyOrderId', radiologyOrderId);
    const res = await fetch(`${API_URL}/dicom/upload`, {
      method: 'POST',
      headers: authHeaders(false),
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Upload failed (${res.status})`);
    }
    const jsonBody = await res.json();
    return (jsonBody.data ?? jsonBody) as DicomUploadResult;
  },

  listStudies(params: { page?: number; limit?: number; query?: string; modality?: string } = {}): Promise<{ items: DicomStudyListItem[]; pagination: { total: number; page: number; limit: number; pages: number } }> {
    const p = new URLSearchParams();
    if (params.page) p.set('page', String(params.page));
    if (params.limit) p.set('limit', String(params.limit));
    if (params.query) p.set('query', params.query);
    if (params.modality) p.set('modality', params.modality);
    const qs = p.toString();
    return json(`/dicom/studies${qs ? `?${qs}` : ''}`);
  },

  getStudy(studyId: string): Promise<{ data: DicomStudyDetail }> {
    return json(`/dicom/studies/${studyId}`);
  },

  deleteStudy(studyId: string): Promise<{ deleted: boolean }> {
    return json(`/dicom/studies/${studyId}`, { method: 'DELETE' });
  },
};

export interface DicomNode {
  id: string;
  name: string;
  aeTitle: string;
  hostname: string;
  port: number;
  isLocal: boolean;
  tls?: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ListenerStats {
  startedAt: string;
  associations: number;
  rejectedAssociations: number;
  storedInstances: number;
  failedInstances: number;
  echoRequests: number;
  lastError?: string;
}

export interface ListenerStatus {
  running: boolean;
  stats: ListenerStats;
}

export interface MwlEntry {
  orderId: string;
  accessionNumber: string | null;
  requestedProcedureId: string | null;
  modality: string | null;
  status: string;
  scheduledDateTime: string | null;
  patient: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    mrn: string | null;
    hospitalNumber: string | null;
  };
  orderNumber: string;
}

export interface EchoResult {
  connected: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

export interface StoreResult {
  sopInstanceUid: string;
  status: number;
  ok?: boolean;
  error?: string;
}

export interface NodeForm {
  name: string;
  aeTitle: string;
  hostname: string;
  port: number;
  isLocal: boolean;
  tls?: boolean;
}

export const dicomNodeApi = {
  listNodes(): Promise<DicomNode[]> {
    return json('/dicom/nodes');
  },

  createNode(body: NodeForm): Promise<DicomNode> {
    return json('/dicom/nodes', { method: 'POST', body: JSON.stringify(body) });
  },

  updateNode(id: string, body: Partial<NodeForm>): Promise<DicomNode> {
    return json(`/dicom/nodes/${id}`, { method: 'POST', body: JSON.stringify(body) });
  },

  deleteNode(id: string): Promise<{ deleted: boolean }> {
    return json(`/dicom/nodes/${id}`, { method: 'DELETE' });
  },

  echoNode(id: string): Promise<EchoResult> {
    return json(`/dicom/nodes/${id}/echo`, { method: 'POST' });
  },

  sendStudyToNode(id: string, studyId: string): Promise<StoreResult[]> {
    return json(`/dicom/nodes/${id}/send`, { method: 'POST', body: JSON.stringify({ studyId }) });
  },

  listenerStatus(): Promise<ListenerStatus> {
    return json('/dicom/listener');
  },

  startListener(nodeId: string): Promise<ListenerStatus> {
    return json('/dicom/listener/start', { method: 'POST', body: JSON.stringify({ nodeId }) });
  },

  stopListener(): Promise<{ running: boolean }> {
    return json('/dicom/listener/stop', { method: 'POST' });
  },

  listMwl(params: { status?: string; query?: string } = {}): Promise<MwlEntry[]> {
    const p = new URLSearchParams();
    if (params.status) p.set('status', params.status);
    if (params.query) p.set('query', params.query);
    const qs = p.toString();
    return json(`/dicom/mwl${qs ? `?${qs}` : ''}`);
  },

  mwlPerformed(orderId: string): Promise<{ performed: boolean }> {
    return json(`/dicom/mwl/${orderId}/performed`, { method: 'POST' });
  },

  mwlCompleted(orderId: string): Promise<{ completed: boolean }> {
    return json(`/dicom/mwl/${orderId}/completed`, { method: 'POST' });
  },
};