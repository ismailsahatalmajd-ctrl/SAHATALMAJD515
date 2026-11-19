import { NextRequest, NextResponse } from 'next/server';
import {
  getCloudToken,
  getCloudLiveStreamUrl,
  getCloudWsStreamUrl,
  getCloudHlsStreamUrl,
  getCloudCameras,
} from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let cameraId = searchParams.get('cameraId');
  const channelStr = searchParams.get('channel') || '1';
  const protocolType = searchParams.get('type') || '1';
  const quality = (searchParams.get('quality') || 'live') as 'live' | 'hd';
  const channel = parseInt(channelStr, 10);

  try {
    let serialNo = 'GK0622137';

    if (!cameraId) {
      const { cameras, deviceSerial } = await getCloudCameras();
      if (deviceSerial) serialNo = deviceSerial;
      const targetCam = cameras.find((c) => c.channelNo === channel);
      if (targetCam) {
        cameraId = targetCam.id;
        if (targetCam.serialNo) serialNo = targetCam.serialNo;
      }
    }

    // 1. Fetch HLS URL (Native mobile video stream, 30 FPS, hardware accelerated)
    let hlsUrl: string | undefined;
    try {
      const hlsData = await getCloudHlsStreamUrl(channel, serialNo, quality === 'hd' ? 'hd' : 'sub');
      hlsUrl = hlsData.hlsUrl;
    } catch (hlsErr: any) {
      console.warn(`HLS resolution warning for channel ${channel}:`, hlsErr.message);
    }

    // 2. Fetch direct authenticated WebSocket stream for PC EZUIKit
    let wsUrl: string | undefined;
    let ezopenUrl: string | undefined;
    let accessToken: string | undefined;
    let streamAreaDomain = 'https://isgpopen.ezvizlife.com';

    try {
      const wsData = await getCloudWsStreamUrl(channel, serialNo, quality);
      wsUrl = wsData.wsUrl;
      ezopenUrl = wsData.ezopenUrl;
      accessToken = wsData.accessToken;
      if (wsData.streamAreaDomain) streamAreaDomain = wsData.streamAreaDomain;
    } catch (wsErr: any) {
      console.warn('Direct WebSocket resolution failed, falling back to gateway live address:', wsErr.message);
    }

    // If WebSocket failed and cameraId is available, fallback to gateway live address
    if (!wsUrl && cameraId) {
      try {
        const streamData = await getCloudLiveStreamUrl(cameraId, serialNo, 'Y1KkbT', protocolType);
        ezopenUrl = streamData.url;
        accessToken = streamData.accessToken;
        if (streamData.streamAreaDomain) streamAreaDomain = streamData.streamAreaDomain;
      } catch (streamErr: any) {
        console.warn('Gateway live address resolution failed:', streamErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      hlsUrl,
      wsUrl,
      url: ezopenUrl,
      accessToken,
      streamAreaDomain,
      type: '1',
      quality,
      channel,
      serialNo,
    });
  } catch (error: any) {
    console.error('Failed to get cloud live stream:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'فشل جلب رابط البث الحي السحابي',
      },
      { status: 500 }
    );
  }
}
