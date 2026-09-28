import { collectMaitriContext } from '../maitri-client';

describe('collectMaitriContext', () => {
  const setUrl = (path: string) => {
    window.history.pushState({}, '', path);
  };

  it('extracts the patient entity from a patient profile route', () => {
    setUrl('/patients/pid-1024');
    const ctx = collectMaitriContext();
    expect(ctx.currentEntity).toBe('patient');
    expect(ctx.currentEntityId).toBe('pid-1024');
    expect(ctx.currentModule).toBe('patients');
    expect(ctx.currentRoute).toBe('/patients/pid-1024');
  });

  it('extracts the doctor entity from a doctor detail route', () => {
    setUrl('/doctors/doc-9');
    const ctx = collectMaitriContext();
    expect(ctx.currentEntity).toBe('doctor');
    expect(ctx.currentEntityId).toBe('doc-9');
  });

  it('sends module without entity for list screens', () => {
    setUrl('/appointments');
    const ctx = collectMaitriContext();
    expect(ctx.currentModule).toBe('appointments');
    expect(ctx.currentEntity).toBeUndefined();
    expect(ctx.currentEntityId).toBeUndefined();
  });

  it('keeps the query string in the route', () => {
    setUrl('/pharmacy?tab=medicines');
    const ctx = collectMaitriContext();
    expect(ctx.currentRoute).toBe('/pharmacy?tab=medicines');
    expect(ctx.currentModule).toBe('pharmacy');
  });

  it('always provides a timezone so dates resolve server-side', () => {
    setUrl('/dashboard');
    const ctx = collectMaitriContext();
    expect(typeof ctx.timeZone).toBe('string');
    expect((ctx.timeZone || '').length).toBeGreaterThan(0);
  });
});
