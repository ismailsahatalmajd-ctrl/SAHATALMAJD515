import { NextRequest, NextResponse } from 'next/server';
import { getCloudToken, getCloudLiveStreamUrl, getCloudWsStreamUrl, getCloudCameras } from '@/lib/hikvision-cloud';

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

    // Try resolving direct authenticated WebSocket stream first
    try {
      const wsData = await getCloudWsStreamUrl(channel, serialNo, quality);
      return NextResponse.json({
        success: true,
        wsUrl: wsData.wsUrl,
        url: wsData.ezopenUrl,
        accessToken: wsData.accessToken,
        streamAreaDomain: wsData.streamAreaDomain || 'https://isgpopen.ezvizlife.com',
        type: '1',
        quality,
        channel,
        serialNo,
      });
    } catch (wsErr: any) {
      console.warn('Direct WebSocket resolution failed, falling back to gateway live address:', wsErr.message);
    }

    if (!cameraId) {
      return NextResponse.json({ error: 'لم يتم العثور على معرّف الكاميرا' }, { status: 404 });
    }

    const streamData = await getCloudLiveStreamUrl(cameraId, serialNo, 'Y1KkbT', protocolType);

    return NextResponse.json({
      success: true,
      url: streamData.url,
      accessToken: streamData.accessToken,
      streamAreaDomain: streamData.streamAreaDomain || 'https://isgpopen.ezvizlife.com',
      type: streamData.type,
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
