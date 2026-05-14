import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  return withDetectAuth(req, async ({ user, m }) => {
    const scan = await prisma.detectScan.findFirst({
      where: { id: params.id, userId: user.id },
      // Explicit select rather than `true` so we intentionally return new
      // analytics columns + raw blobs for replay/comparison. The payload
      // JSON still carries the signal/assessment detail for UI rendering.
      select: {
        id: true,
        name: true,
        createdAt: true,
        score: true,
        level: true,

        // Server network
        ipPublic: true,
        ipFamily: true,
        ipCountry: true,
        ipRegion: true,
        ipCity: true,
        ipAsn: true,
        ipAsOrg: true,
        ipHostname: true,
        ipIsVpn: true,
        ipIsProxy: true,
        ipIsTor: true,
        ipIsHosting: true,

        tlsJa3: true,
        tlsJa4: true,
        serverUserAgent: true,
        acceptLanguage: true,
        acceptEncoding: true,

        // Client WebRTC
        webrtcPublicIp: true,
        webrtcLocalIpCount: true,
        webrtcIpv6Count: true,
        webrtcHasMdns: true,
        webrtcIpMismatch: true,

        // Browser fingerprint
        clientUserAgent: true,
        platform: true,
        language: true,
        languageCount: true,
        timezoneName: true,
        timezoneOffsetMin: true,
        screenWidth: true,
        screenHeight: true,
        screenColorDepth: true,
        hardwareConcurrency: true,
        deviceMemoryGb: true,
        pluginCount: true,
        cookieEnabled: true,
        doNotTrack: true,
        onlineStatus: true,

        // Canvas / WebGL
        webglVendor: true,
        webglRenderer: true,

        // Fonts
        fontTotalCount: true,
        fontUniqueCount: true,

        // DNS
        dohSupport: true,
        dnssecSupport: true,
        resolverLocation: true,

        // CDP
        cdpDetected: true,
        cdpConfidence: true,
        webdriverFlag: true,
        isChromium: true,

        // Raw fingerprint blobs
        rawUserAgent: true,
        rawCanvas2dDataUrl: true,
        rawWebglDataUrl: true,
        rawAudioFp: true,
        rawFontListSorted: true,

        payload: true,
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'not_found', message: m.apiErrors.scanNotFound },
        { status: 404 }
      );
    }

    return NextResponse.json(scan);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withDetectAuth(req, async ({ user, m }) => {
    const result = await prisma.detectScan.deleteMany({
      where: { id: params.id, userId: user.id },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'not_found', message: m.apiErrors.scanNotFound },
        { status: 404 }
      );
    }
    return NextResponse.json({ deleted: true });
  });
}
