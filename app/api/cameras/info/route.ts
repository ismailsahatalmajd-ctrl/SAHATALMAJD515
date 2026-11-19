import { NextRequest, NextResponse } from 'next/server';
import { getDeviceInfo, getCameraCustomSettings, saveCameraCustomSettings } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const info = await getDeviceInfo();
    const settings = getCameraCustomSettings();

    const channels = Array.from({ length: 16 }, (_, i) => {
      const channelNum = i + 1;
      return {
        channel: channelNum,
        name: settings.customNames[channelNum] || `كاميرا ${channelNum}`,
        mainStreamId: channelNum * 100 + 1,
        subStreamId: channelNum * 100 + 2,
      };
    });

    return NextResponse.json({
      device: info,
      channels,
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch camera info' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = saveCameraCustomSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update settings' }, { status: 500 });
  }
}
