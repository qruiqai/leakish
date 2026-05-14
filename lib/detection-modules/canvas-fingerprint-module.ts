import { logger } from '@/lib/logger';
import type { DetectionModule, DetectionResult } from './types';

export interface CanvasFingerprintData {
  canvas2D: string;
  canvasWebGL?: string;
  canvasText: string;
  supportedFormats: string[];
  /** UNMASKED_VENDOR_WEBGL — e.g. "Google Inc. (Apple)" on macOS Chrome. */
  webglVendor?: string;
  /** UNMASKED_RENDERER_WEBGL — e.g. "ANGLE (Apple, M1 Pro, ...)". Used by
   * cross-scan analytics to group devices by GPU. */
  webglRenderer?: string;
}

async function detectCanvasFingerprint(): Promise<CanvasFingerprintData> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 200;
  canvas.height = 50;

  if (!ctx) {
    throw new Error('Could not get 2D context');
  }

  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('Canvas fingerprint test 🔍', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('Canvas fingerprint test 🔍', 4, 17);

  const canvas2D = canvas.toDataURL();

  const textCanvas = document.createElement('canvas');
  const textCtx = textCanvas.getContext('2d');
  textCanvas.width = 50;
  textCanvas.height = 50;

  if (textCtx) {
    textCtx.textBaseline = 'top';
    textCtx.font = '11px Arial';
    textCtx.fillText('Cwm fjordbank glyphs vext quiz', 2, 2);
    textCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    textCtx.fillText('Cwm fjordbank glyphs vext quiz', 4, 20);
  }

  const canvasText = textCanvas.toDataURL();

  let canvasWebGL: string | undefined;
  let webglVendor: string | undefined;
  let webglRenderer: string | undefined;
  try {
    const webglCanvas = document.createElement('canvas');
    const gl =
      webglCanvas.getContext('webgl') ||
      (webglCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (gl) {
      // Pull vendor/renderer strings first — cheap, and independent of the
      // shader-rendered fingerprint below. Kept behind the debug-info
      // extension because mainline vendor/renderer return the spec-bland
      // "WebKit WebGL" on browsers that suppress identity.
      try {
        const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugExt) {
          const v = gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL);
          const r = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
          if (typeof v === 'string') webglVendor = v;
          if (typeof r === 'string') webglRenderer = r;
        }
      } catch {
        /* extension not available — leave undefined */
      }

      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

      if (vertexShader && fragmentShader) {
        gl.shaderSource(
          vertexShader,
          'attribute vec2 attrVertex;varying vec2 varyinTexCoordinate;uniform vec2 uniformOffset;void main(){varyinTexCoordinate=attrVertex+uniformOffset;gl_Position=vec4(attrVertex,0,1);}'
        );
        gl.compileShader(vertexShader);

        gl.shaderSource(
          fragmentShader,
          'precision mediump float;varying vec2 varyinTexCoordinate;void main() {gl_FragColor=vec4(varyinTexCoordinate,0,1);}'
        );
        gl.compileShader(fragmentShader);

        const program = gl.createProgram();
        if (program) {
          gl.attachShader(program, vertexShader);
          gl.attachShader(program, fragmentShader);
          gl.linkProgram(program);
          gl.useProgram(program);

          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1]), gl.STATIC_DRAW);

          const attribLocation = gl.getAttribLocation(program, 'attrVertex');
          gl.enableVertexAttribArray(attribLocation);
          gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);

          gl.drawArrays(gl.TRIANGLES, 0, 3);
          canvasWebGL = webglCanvas.toDataURL();
        }
      }
    }
  } catch (error) {
    logger.debug('WebGL not supported or error occurred:', error);
  }

  const supportedFormats: string[] = [];
  const formats = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  for (const format of formats) {
    try {
      const testCanvas = document.createElement('canvas');
      const dataUrl = testCanvas.toDataURL(format);
      if (dataUrl.indexOf(`data:${format}`) === 0) {
        supportedFormats.push(format);
      }
    } catch {
      // Format not supported
    }
  }

  return {
    canvas2D,
    canvasWebGL,
    canvasText,
    supportedFormats,
    webglVendor,
    webglRenderer,
  };
}

export const canvasFingerprintModule: DetectionModule<CanvasFingerprintData> = {
  id: 'canvas-fingerprint',
  name: 'Canvas fingerprint',
  description: 'Fingerprint from Canvas 2D / WebGL rendering differences',
  category: 'browser',
  icon: 'Image',
  enabled: true,
  detect: async (): Promise<DetectionResult<CanvasFingerprintData>> => {
    try {
      const data = await detectCanvasFingerprint();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          hasWebGL: !!data.canvasWebGL,
          supportedFormatCount: data.supportedFormats.length,
          canvas2DHash: data.canvas2D.slice(-8),
          canvasTextHash: data.canvasText.slice(-8),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Canvas fingerprint detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
