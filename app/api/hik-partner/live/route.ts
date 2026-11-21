import { NextRequest, NextResponse } from 'next/server';
import { getPartnerLiveAddress } from '@/lib/hik-partner-pro';
import { getCloudWsStreamUrl } from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceSerial = searchParams.get('deviceSerial') || searchParams.get('serial') || 'FH8945678';
  const channelNo = parseInt(searchParams.get('channel') || '1', 10);
  const quality = (searchParams.get('quality') || 'live') as 'live' | 'hd';

  try {
    try {
      const liveData = await getPartnerLiveAddress(deviceSerial, channelNo, quality);
      return NextResponse.json({
        success: true,
        url: liveData.url,
        directWsUrl: liveData.directWsUrl,
        ezopenUrl: liveData.ezopenUrl,
        ticket: liveData.ticket,
        accessToken: liveData.accessToken,
        deviceSerial: liveData.deviceSerial,
        channelNo: liveData.channelNo,
        quality,
      });
    } catch (partnerErr: any) {
      console.warn(`Hik-Partner Pro live address failed for ${deviceSerial}:`, partnerErr?.message);
      if (deviceSerial === 'GK0622137') {
        const wsData = await getCloudWsStreamUrl(channelNo, 'GK0622137', quality);
        return NextResponse.json({
          success: true,
          url: wsData.wsUrl,
          directWsUrl: wsData.wsUrl,
          ezopenUrl: `ezopen://open.ezviz.com/GK0622137/${channelNo}.${quality === 'hd' ? 'hd.' : ''}live`,
          ticket: '',
          accessToken: wsData.accessToken,
          deviceSerial: 'GK0622137',
          channelNo,
          quality,
        });
      }
      throw partnerErr;
    }
  } catch (error: any) {
    console.error('Failed to get Hik-Partner live address:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'فشل جلب رابط البث من منصة Hik-Partner Pro',
      },
      { status: 500 }
    );
  }
}
