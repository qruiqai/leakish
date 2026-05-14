import { logger } from '@/lib/logger';
import { DETECT_TIMEOUTS, STUN_SERVERS } from './constants';
import {
  classifyIP,
  extractIPv6FromCandidate,
  extractMDNSHost,
  IPV4_EXTRACT_REGEX,
  type IPv6Scope,
} from './ip-utils';
import type { DetectionModule, DetectionResult } from './types';

export interface IPv6Entry {
  address: string;
  scope: IPv6Scope;
}

export interface WebRTCData {
  localIPs: string[];
  publicIPs: string[];
  ipv6Addresses: IPv6Entry[];
  debug?: {
    totalCandidates: number;
    mDNSCandidates: string[];
    rawCandidates: string[];
  };
}

async function detectWebRTCInfo(): Promise<WebRTCData> {
  const localIPs = new Set<string>();
  const publicIPs = new Set<string>();
  const ipv6Map = new Map<string, IPv6Scope>();
  const mDNSCandidates = new Set<string>();
  const rawCandidates: string[] = [];
  let totalCandidates = 0;

  return new Promise((resolve, reject) => {
    let pc: RTCPeerConnection | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
      resolve({
        localIPs: Array.from(localIPs),
        publicIPs: Array.from(publicIPs),
        ipv6Addresses: Array.from(ipv6Map, ([address, scope]) => ({ address, scope })),
        debug: {
          totalCandidates,
          mDNSCandidates: Array.from(mDNSCandidates),
          rawCandidates,
        },
      });
    };

    const timeout = setTimeout(() => {
      logger.debug('WebRTC detection timeout reached');
      finish();
    }, DETECT_TIMEOUTS.webrtcMs);

    try {
      pc = new RTCPeerConnection({
        iceServers: STUN_SERVERS.map(urls => ({ urls })),
        iceCandidatePoolSize: 10,
      });

      pc.onicegatheringstatechange = () => {
        logger.debug('ICE gathering state:', pc?.iceGatheringState);
      };

      pc.onicecandidate = event => {
        if (!event.candidate) {
          finish();
          return;
        }

        totalCandidates++;
        const { candidate } = event.candidate;
        if (!candidate) return;
        rawCandidates.push(candidate);

        if (candidate.includes('.local')) {
          const host = extractMDNSHost(candidate);
          if (host) mDNSCandidates.add(host);
        }

        const ipv4Matches = candidate.match(IPV4_EXTRACT_REGEX);
        if (ipv4Matches) {
          for (const ip of ipv4Matches) {
            if (ip === '0.0.0.0') continue;
            const cls = classifyIP(ip);
            if (cls === 'local') localIPs.add(ip);
            else if (cls === 'public') publicIPs.add(ip);
          }
        }

        for (const { address, scope } of extractIPv6FromCandidate(candidate)) {
          if (!ipv6Map.has(address)) ipv6Map.set(address, scope);
        }
      };

      pc.createDataChannel('detect');
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc!.setLocalDescription(offer))
        .catch(error => {
          logger.warn('WebRTC createOffer failed:', error);
          settled = true;
          clearTimeout(timeout);
          if (pc) {
            try {
              pc.close();
            } catch {
              // ignore
            }
          }
          reject(error);
        });
    } catch (error) {
      logger.warn('WebRTC detection error:', error);
      settled = true;
      clearTimeout(timeout);
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
      reject(error);
    }
  });
}

export const webrtcModule: DetectionModule<WebRTCData> = {
  id: 'webrtc',
  name: 'WebRTC network check',
  description: 'STUN probe of local / public IP and mDNS candidates',
  category: 'network',
  icon: 'Network',
  enabled: true,
  detect: async (): Promise<DetectionResult<WebRTCData>> => {
    try {
      const data = await detectWebRTCInfo();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          hasLocalIPs: data.localIPs.length > 0,
          hasPublicIPs: data.publicIPs.length > 0,
          hasMDNS: (data.debug?.mDNSCandidates?.length ?? 0) > 0,
          totalCandidates: data.debug?.totalCandidates ?? 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebRTC detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
