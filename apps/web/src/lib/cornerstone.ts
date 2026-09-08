import * as cornerstone from 'cornerstone-core';
import * as dicomParser from 'dicom-parser';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderNoWebWorkers.bundle.min.js';
import { authBeforeSend, wadoUrl } from './dicom';

let ready = false;

export function initCornerstone(): void {
  if (ready || typeof window === 'undefined') return;

  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({ beforeSend: authBeforeSend });

  cornerstoneWADOImageLoader.webWorkerManager.initialize({
    maxWebWorkers: 1,
    startWebWorkersOnDemand: true,
    taskConfiguration: {
      decodeTask: {
        initializeCodecsOnStartup: true,
        usePDFJS: false,
        strict: false,
      },
    },
  });

  cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
  ready = true;
}

export function wadoImageId(studyId: string, instanceId: string): string {
  return `wadouri:${wadoUrl(studyId, instanceId)}`;
}

export const cornerstoneCore = cornerstone;
export const cornerstoneLoader = cornerstoneWADOImageLoader;