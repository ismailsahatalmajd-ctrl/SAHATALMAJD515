import { NextResponse } from 'next/server';
import { getCloudCameras } from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getCloudCameras();
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error('HikCentral Connect cloud cameras error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch cloud cameras',
        cameras: [],
      },
      { status: 500 }
    );
  }
}
