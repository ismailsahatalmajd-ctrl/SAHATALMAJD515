import { NextRequest, NextResponse } from 'next/server';
import { searchRecordedClips } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = parseInt(searchParams.get('channel') || '1', 10);
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = searchParams.get('date') || today;

  if (isNaN(channel) || channel < 1 || channel > 32) {
    return NextResponse.json({ error: 'رقم الكاميرا غير صحيح' }, { status: 400 });
  }

  try {
    const clips = await searchRecordedClips(channel, dateStr);
    return NextResponse.json({
      success: true,
      channel,
      date: dateStr,
      clips,
    });
  } catch (error: any) {
    console.error(`Playback search error for CH ${channel}:`, error?.message || error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'فشل البحث في التسجيلات',
        clips: [],
      },
      { status: 500 }
    );
  }
}
