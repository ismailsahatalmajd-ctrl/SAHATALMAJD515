import { NextRequest, NextResponse } from 'next/server';
import { getCloudAlarms } from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelStr = searchParams.get('channel');
  const targetType = searchParams.get('type'); // 'human' | 'vehicle' | 'motion' | 'all'
  const channelNo = channelStr ? parseInt(channelStr, 10) : undefined;

  try {
    const data = await getCloudAlarms(channelNo);
    let filtered = data.alarms;

    if (targetType && targetType !== 'all') {
      filtered = filtered.filter((a) => a.targetType === targetType);
    }

    return NextResponse.json({
      success: true,
      total: filtered.length,
      alarms: filtered,
    });
  } catch (err: any) {
    console.error('Alarms API error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'تعذر جلب التنبيهات من السحابة' },
      { status: 500 }
    );
  }
}
