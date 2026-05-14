import type { WebRTCData } from '../webrtc-module';
import { webrtcModule } from '../webrtc-module';

type CandidateHandler = ((event: { candidate: RTCIceCandidate | null }) => void) | null;

class FakeRTCPeerConnection {
  public iceGatheringState: RTCIceGatheringState = 'new';
  public onicecandidate: CandidateHandler = null;
  public onicegatheringstatechange: (() => void) | null = null;
  private closed = false;

  constructor(_config?: RTCConfiguration) {}

  createDataChannel(_label: string) {
    return {} as RTCDataChannel;
  }

  async createOffer(_options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: '' };
  }

  async setLocalDescription(_desc: RTCSessionDescriptionInit): Promise<void> {
    // Schedule fake ICE candidates asynchronously.
    queueMicrotask(() => {
      if (!this.onicecandidate) return;
      const candidates = [
        'candidate:1 1 udp 2113937151 192.168.1.42 57342 typ host',
        'candidate:2 1 udp 1677729535 203.0.113.5 43210 typ srflx',
        'candidate:3 1 udp 2113937151 abcd1234-abcd-1234-abcd-1234abcd5678.local 57343 typ host',
        'candidate:4 1 udp 2113937151 fe80::1234:5678:90ab:cdef 12345 typ host',
      ];
      for (const c of candidates) {
        this.onicecandidate({
          candidate: { candidate: c } as unknown as RTCIceCandidate,
        });
      }
      this.onicecandidate({ candidate: null });
    });
  }

  close() {
    this.closed = true;
  }
}

describe('webrtcModule', () => {
  const originalRTC = globalThis.RTCPeerConnection;

  beforeAll(() => {
    (globalThis as unknown as { RTCPeerConnection: typeof RTCPeerConnection }).RTCPeerConnection =
      FakeRTCPeerConnection as unknown as typeof RTCPeerConnection;
  });

  afterAll(() => {
    (
      globalThis as unknown as { RTCPeerConnection: typeof RTCPeerConnection | undefined }
    ).RTCPeerConnection = originalRTC;
  });

  it('classifies IPs and extracts mDNS + IPv6 from candidates', async () => {
    const result = await webrtcModule.detect();
    expect(result.success).toBe(true);
    const data = result.data as WebRTCData;
    expect(data.localIPs).toContain('192.168.1.42');
    expect(data.publicIPs).toContain('203.0.113.5');
    expect(data.debug?.mDNSCandidates).toContain('abcd1234-abcd-1234-abcd-1234abcd5678.local');
    expect(
      data.ipv6Addresses.some(
        entry => entry.address.includes('fe80') && entry.scope === 'link-local'
      )
    ).toBe(true);
    expect(result.metadata?.totalCandidates).toBe(4);
  });
});
