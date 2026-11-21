import { NextRequest, NextResponse } from 'next/server';
import { getPartnerLiveAddress } from '@/lib/hik-partner-pro';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceSerial = searchParams.get('deviceSerial') || searchParams.get('serial') || 'FH8945678';
  const channelNo = parseInt(searchParams.get('channel') || '1', 10);
  const quality = (searchParams.get('quality') || 'live') as 'live' | 'hd';

  try {
    const liveData = await getPartnerLiveAddress(deviceSerial, channelNo, quality);

    return NextResponse.json({
      success: true,
      url: liveData.url,
      ticket: liveData.ticket,
      deviceSerial: liveData.deviceSerial,
      channelNo: liveData.channelNo,
      quality,
    });
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
