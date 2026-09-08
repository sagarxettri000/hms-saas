declare module 'cornerstone-core' {
  export interface CanvasCoordinates {
    x: number;
    y: number;
  }

  export interface ImageStatistics {
    mean: number;
    stdDev: number;
    max: number;
    min: number;
    hasPixelSpacing: boolean;
  }

  export interface Image {
    imageId: string;
    minPixelValue: number;
    maxPixelValue: number;
    slope: number;
    intercept: number;
    windowCenter: number;
    windowWidth: number;
    getPixelData(): ArrayBuffer;
    getImageData(): ImageData | null;
    getHeight(): number;
    getWidth(): number;
    getColumnPixelSpacing(): number;
    getRowPixelSpacing(): number;
    getIntercept(): number;
    getSlope(): number;
    getWindowWidth(): number;
    getWindowCenter(): number;
    getColorTransferFunction?(): any;
    color?: boolean;
    rgba?: boolean;
    rows?: number;
    columns?: number;
    sizeInBytes?: number;
    preScale?: any;
    stats?: ImageStatistics;
  }

  export interface VOI {
    windowWidth: number;
    windowCenter: number;
  }

  export interface Viewport {
    scale: number;
    translation: CanvasCoordinates;
    voi: VOI;
    invert?: boolean;
    pixelReplication: boolean;
    rotation?: number;
    hflip?: boolean;
    vflip?: boolean;
    modalityLUT?: any;
    voiLUT?: any;
    colormap?: any;
    labelmap?: boolean;
    texture?: any;
  }

  export interface EnabledElement {
    canvas: HTMLCanvasElement;
    image?: Image;
    viewport: Viewport;
    invalidated: boolean;
  }

  export function init(): void;
  export function enable(element: HTMLElement, options?: any): void;
  export function disable(element: HTMLElement): void;
  export function displayImage(element: HTMLElement, image: Image, viewport?: Viewport): void;
  export function loadImage(imageId: string, options?: any): Promise<Image>;
  export function loadImageFromImageData(imageData: any): Image;
  export function loadAndCacheImage(imageId: string, options?: any): Promise<Image>;
  export function getViewport(element: HTMLElement): Viewport;
  export function setViewport(element: HTMLElement, viewport: Viewport): void;
  export function getEnabledElement(element: HTMLElement): EnabledElement;
  export function getDefaultViewport(element: HTMLElement, image?: Image): Viewport;
  export function fitToWindow(element: HTMLElement): void;
  export function resize(element: HTMLElement, force?: boolean): void;
  export function invalidate(element: HTMLElement): void;
  export function registerImageLoader(scheme: string | { [scheme: string]: (...args: any[]) => any }, imageLoader: (...args: any[]) => any): void;
  export function registerImageLoaderImageData(loader: (...args: any[]) => any): void;
  export function registerColormap(colormap: any): void;
  export function getColormap(name: string, numOfColors?: number): any;
  export function addColormap(name: string, colormap: any): void;
  export function renderToCanvas(canvas: HTMLCanvasElement, image: Image, viewport?: Viewport): void;
  export function renderAndCorrectCanvas(canvas: HTMLCanvasElement, image: Image, viewport?: Viewport, invalidated?: boolean): void;
  export const eventTarget: EventTarget;

  export const imageCache: {
    putImageLoadObject(imageId: string, imageLoadObject: any): void;
    getImageLoadObject(imageId: string): any;
    removeImageLoadObject(imageId: string): void;
    purge(): void;
    getCacheInfo(): { numberOfImagesCached: number; cacheSizeInBytes: number; maxCacheSizeInBytes: number };
  };

  export const metaData: {
    addProvider(provider: (type: string, imageId: string) => any, priority?: number): void;
    removeProvider(provider: (type: string, imageId: string) => any): void;
    get(type: string, imageId?: string): any;
  };

  const cornerstone: {
    init: typeof init;
    enable: typeof enable;
    disable: typeof disable;
    displayImage: typeof displayImage;
    loadImage: typeof loadImage;
    loadAndCacheImage: typeof loadAndCacheImage;
    getViewport: typeof getViewport;
    setViewport: typeof setViewport;
    getEnabledElement: typeof getEnabledElement;
    getDefaultViewport: typeof getDefaultViewport;
    fitToWindow: typeof fitToWindow;
    resize: typeof resize;
    invalidate: typeof invalidate;
    registerImageLoader: typeof registerImageLoader;
    renderToCanvas: typeof renderToCanvas;
    imageCache: typeof imageCache;
    metaData: typeof metaData;
  };
  export default cornerstone;
}

declare module 'cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderNoWebWorkers.bundle.min.js' {
  export interface WadoImageOptions {
    beforeSend?: (xhr: XMLHttpRequest) => void;
    onProgress?: (percent: number) => void;
  }

  export interface WadoUridIFace {
    loadImage(imageId: string, options?: WadoImageOptions): Promise<any>;
  }

  const cornerstoneWADOImageLoader: {
    external: {
      cornerstone: any;
      dicomParser: any;
    };
    version: string;
    wadouri: WadoUridIFace;
    wadors?: WadoUridIFace;
    dicomfile?: WadoUridIFace;
    configure(options: { beforeSend?: (xhr: XMLHttpRequest) => void }): void;
    webWorkerManager: {
      initialize(config: Record<string, any>): void;
    };
  };
  export default cornerstoneWADOImageLoader;
}