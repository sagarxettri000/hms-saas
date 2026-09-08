'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as cornerstone from 'cornerstone-core';
import { dicomApi } from '@/lib/dicom';
import { initCornerstone, wadoImageId } from '@/lib/cornerstone';
import type { DicomStudyDetail, DicomInstanceListItem } from '@/lib/dicom';
import { DicomToolbar, type DicomTool } from './DicomToolbar';
import { DicomSeriesNavigator } from './DicomSeriesNavigator';
import { DicomMetadataPanel } from './DicomMetadataPanel';

interface DicomViewerProps {
  studyId: string;
  onBack: () => void;
  onDeleted?: () => void;
}

interface FlatInstance {
  seriesId: string;
  seriesNumber: number | null;
  modality: string | null;
  instance: DicomInstanceListItem;
}

function sortSeries(a: { seriesNumber: number | null }, b: { seriesNumber: number | null }) {
  return (a.seriesNumber ?? Number.MAX_SAFE_INTEGER) - (b.seriesNumber ?? Number.MAX_SAFE_INTEGER);
}

function sortInstances(a: { instanceNumber: number | null }, b: { instanceNumber: number | null }) {
  return (a.instanceNumber ?? Number.MAX_SAFE_INTEGER) - (b.instanceNumber ?? Number.MAX_SAFE_INTEGER);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

export function DicomViewer({ studyId, onBack, onDeleted }: DicomViewerProps) {
  const [study, setStudy] = useState<DicomStudyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DicomTool>('wwwc');
  const [invert, setInvert] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const elementRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{
    startX: number;
    startY: number;
    tool: DicomTool;
    button: number;
    viewport: cornerstone.Viewport;
  } | null>(null);
  const invertRef = useRef(false);
  invertRef.current = invert;

  const flat = useMemo(() => {
    if (!study) return [] as FlatInstance[];
    return study.series
      .slice()
      .sort(sortSeries)
      .flatMap((s) =>
        s.instances.slice().sort(sortInstances).map((instance) => ({
          seriesId: s.id,
          seriesNumber: s.seriesNumber,
          modality: s.modality,
          instance,
        })),
      );
  }, [study]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    dicomApi
      .getStudy(studyId)
      .then((res: any) => {
        if (!active) return;
        const d = res?.data ?? res;
        setStudy(d);
        const first = d?.series?.[0]?.instances?.[0];
        if (first) setActiveInstanceId(first.id);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load study');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studyId]);

  // Initialize cornerstone and attach the viewport element.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    initCornerstone();
    try {
      cornerstone.enable(element);
      cornerstone.resize(element, true);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Viewer init failed');
    }

    const ro = new ResizeObserver(() => {
      try {
        cornerstone.resize(element, true);
      } catch {
        // ignore
      }
    });
    ro.observe(element);

    return () => {
      ro.disconnect();
      try {
        cornerstone.disable(element);
      } catch {
        // ignore
      }
    };
  }, [studyId]);

  const renderInstance = useCallback(
    (instanceId: string) => {
      const element = elementRef.current;
      if (!element || !study) return;
      setImageLoading(true);
      setImageError(null);
      const imageId = wadoImageId(studyId, instanceId);
      cornerstone
        .loadAndCacheImage(imageId)
        .then((image) => {
          if (elementRef.current !== element) return;
          cornerstone.displayImage(element, image);
          if (invertRef.current) {
            const vp = cornerstone.getViewport(element);
            vp.invert = true;
            cornerstone.setViewport(element, vp);
          }
        })
        .catch((e) => {
          setImageError(e instanceof Error ? e.message : 'Failed to render image');
        })
        .finally(() => {
          if (elementRef.current === element) setImageLoading(false);
        });
    },
    [study, studyId],
  );

  useEffect(() => {
    if (activeInstanceId) renderInstance(activeInstanceId);
  }, [activeInstanceId, renderInstance]);

  const indexFor = useCallback(
    (instanceId: string) => flat.findIndex((f) => f.instance.id === instanceId),
    [flat],
  );

  const goPrev = useCallback(() => {
    if (!activeInstanceId) return;
    const i = indexFor(activeInstanceId);
    if (i > 0) setActiveInstanceId(flat[i - 1].instance.id);
  }, [activeInstanceId, flat, indexFor]);

  const goNext = useCallback(() => {
    if (!activeInstanceId) return;
    const i = indexFor(activeInstanceId);
    if (i >= 0 && i < flat.length - 1) setActiveInstanceId(flat[i + 1].instance.id);
  }, [activeInstanceId, flat, indexFor]);

  const activeFlatIndex = activeInstanceId ? indexFor(activeInstanceId) : -1;

  // ---- Pointer tools (WW/L, pan, zoom) ----
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const prevent = (e: Event) => e.preventDefault();

    const imageCtx = () => {
      try {
        return cornerstone.getEnabledElement(element);
      } catch {
        return null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      const ctx = imageCtx();
      if (!ctx?.image) return;
      e.preventDefault();
      const vp = cornerstone.getViewport(element);
      const factor = Math.exp(-e.deltaY * 0.001);
      vp.scale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
      cornerstone.setViewport(element, vp);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      const ctx = imageCtx();
      if (!ctx?.image) return;
      e.preventDefault();
      element.setPointerCapture(e.pointerId);
      const tool = e.button === 2 ? 'pan' : activeTool;
      pointerRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        tool,
        button: e.button,
        viewport: cornerstone.getViewport(element),
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pointerRef.current;
      const ctx = imageCtx();
      if (!p || !ctx?.image) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      const vp = { ...p.viewport };

      if (p.tool === 'wwwc') {
        const initialWW = p.viewport.voi.windowWidth;
        const initialWC = p.viewport.voi.windowCenter;
        const sensitivity = Math.max(1, initialWW * 0.004);
        vp.voi = {
          windowWidth: Math.max(1, initialWW + dx * sensitivity),
          windowCenter: initialWC - dy * sensitivity,
        };
      } else if (p.tool === 'zoom') {
        vp.scale = clamp(p.viewport.scale * Math.exp(dy * 0.005), MIN_SCALE, MAX_SCALE);
      } else {
        vp.translation = {
          x: p.viewport.translation.x + dx / p.viewport.scale,
          y: p.viewport.translation.y + dy / p.viewport.scale,
        };
      }
      cornerstone.setViewport(element, vp);
    };

    const endPointer = () => {
      pointerRef.current = null;
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('contextmenu', prevent);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('contextmenu', prevent);
    };
  }, [elementRef, activeTool]);

  const toggleInvert = useCallback(() => {
    const element = elementRef.current;
    const next = !invertRef.current;
    setInvert(next);
    if (!element) return;
    try {
      const vp = cornerstone.getViewport(element);
      vp.invert = next;
      cornerstone.setViewport(element, vp);
    } catch {
      // ignore
    }
  }, []);

  const resetViewport = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    try {
      const ctx = cornerstone.getEnabledElement(element);
      cornerstone.displayImage(element, ctx.image!);
    } catch {
      // ignore
    }
  }, []);

  const fitViewport = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    try {
      cornerstone.fitToWindow(element);
    } catch {
      // ignore
    }
  }, []);

  const handleDelete = async () => {
    if (!study || deleting) return;
    if (!window.confirm('Delete this study and all its images?')) return;
    setDeleting(true);
    try {
      await dicomApi.deleteStudy(study.id);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
    setDeleting(false);
  };

  if (loading) return <div className="loading">Loading study…</div>;
  if (error && !study) return (
    <div style={{ padding: '0 0 24px' }}>
      <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to DICOM Studies</button>
      <div className="empty" style={{ marginTop: 16 }}>{error}</div>
    </div>
  );
  if (!study) return (
    <div style={{ padding: '0 0 24px' }}>
      <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to DICOM Studies</button>
      <div className="empty" style={{ marginTop: 16 }}>Study not found</div>
    </div>
  );

  const position = activeFlatIndex >= 0 ? String(activeFlatIndex + 1) : '—';

  return (
    <div style={{ padding: '0 0 24px' }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← Back to DICOM Studies</button>
          <h1 className="page-title" style={{ margin: 0 }}>
            DICOM Viewer
            <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 10 }}>{study.accessionNumber || ''}</span>
          </h1>
          <p className="page-subtitle">
            {study.studyDescription || study.modality || 'Study'} · {study.modality || '—'} · {study.series.length} series ·{' '}
            {study.series.reduce((n, s) => n + s.instances.length, 0)} images
          </p>
        </div>
        <button className="btn btn-sm btn-danger" disabled={deleting} onClick={handleDelete}>
          {deleting ? 'Deleting…' : 'Delete Study'}
        </button>
      </div>

      <DicomToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        invert={invert}
        onToggleInvert={toggleInvert}
        onReset={resetViewport}
        onFit={fitViewport}
        onPrev={goPrev}
        onNext={goNext}
        canPrev={activeFlatIndex > 0}
        canNext={activeFlatIndex >= 0 && activeFlatIndex < flat.length - 1}
        position={position}
        total={flat.length}
        loading={imageLoading}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: 16, marginTop: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Series</div>
          <DicomSeriesNavigator
            series={study.series}
            activeInstanceId={activeInstanceId}
            onSelect={setActiveInstanceId}
          />
        </div>

        <div>
          <div
            ref={elementRef}
            className="card"
            style={{
              height: 'calc(100vh - 260px)',
              minHeight: 420,
              padding: 0,
              overflow: 'hidden',
              position: 'relative',
              touchAction: 'none',
              userSelect: 'none',
              cursor: activeTool === 'pan' ? 'grab' : 'crosshair',
              background: '#000',
            }}
          >
            {imageError && (
              <div className="empty" style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'var(--bg)' }}>
                {imageError}
              </div>
            )}
          </div>
          <div className="note" style={{ marginTop: 6, textAlign: 'center' }}>
            Left-drag: {activeTool === 'wwwc' ? 'window/level' : activeTool === 'zoom' ? 'zoom' : 'pan'} · Right-drag: pan · Wheel: zoom · Fit: {position}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Details</div>
          <DicomMetadataPanel study={study} />
        </div>
      </div>
    </div>
  );
}