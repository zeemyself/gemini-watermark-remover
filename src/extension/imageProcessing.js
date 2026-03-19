import { canvasToBlob } from '../core/canvasBlob.js';
import { removeWatermarkFromImage } from '../sdk/browser.js';

function loadImageFromObjectUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode Gemini image blob'));
    image.src = objectUrl;
  });
}

async function loadRenderableFromBlobFallback(blob, originalError) {
  if (typeof createImageBitmap !== 'function') {
    throw originalError;
  }

  try {
    return await createImageBitmap(blob);
  } catch {
    throw originalError;
  }
}

export async function loadImageFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    try {
      return await loadImageFromObjectUrl(objectUrl);
    } catch (error) {
      return await loadRenderableFromBlobFallback(blob, error);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function processWatermarkBlob(blob) {
  const image = await loadImageFromBlob(blob);
  const result = await removeWatermarkFromImage(image, { adaptiveMode: 'always' });
  return {
    processedBlob: await canvasToBlob(result.canvas),
    processedMeta: result.meta || null
  };
}

export async function removeWatermarkFromBlob(blob) {
  const result = await processWatermarkBlob(blob);
  return result.processedBlob;
}
