export type { DetectionModule, DetectionResult, ModuleCategory, ModuleConfig } from './types';

export { webrtcModule } from './webrtc-module';
export type { WebRTCData } from './webrtc-module';

export { browserFingerprintModule } from './browser-fingerprint-module';
export type { BrowserFingerprintData } from './browser-fingerprint-module';

export { canvasFingerprintModule } from './canvas-fingerprint-module';
export type { CanvasFingerprintData } from './canvas-fingerprint-module';

export { audioFingerprintModule } from './audio-fingerprint-module';
export type { AudioFingerprintData } from './audio-fingerprint-module';

export { fontDetectionModule } from './font-detection-module';
export type { FontDetectionData } from './font-detection-module';

export { cdpDetectionModule } from './cdp-detection-module';
export type { CDPDetectionData, PortProbeResult, AutomationSignal } from './cdp-detection-module';

export { dnsModule } from './dns-module';
export type { DNSData } from './dns-module';

export { networkProbeModule } from './network-probe-module';
export type { NetworkProbeData } from './network-probe-module';

export { ModuleManager, moduleManager } from './module-manager';
export type { ModuleStats } from './module-manager';
