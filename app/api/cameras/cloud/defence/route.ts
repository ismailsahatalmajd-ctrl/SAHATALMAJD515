import { NextRequest, NextResponse } from 'next/server';
import { getCloudDefenceStatus, setCloudDefence } from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getCloudDefenceStatus();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'تعذر قراءة حالة الحراسة' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const isDefence = !!body.isDefence;
    const ok = await setCloudDefence(isDefence);

    return NextResponse.json({
      success: ok,
      isDefence,
      message: isDefence
        ? 'تم تفعيل المراقبة الذكية خارج أوقات العمل بنجاح'
        : 'تم إيقاف المراقبة الذكية خارج أوقات العمل',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'تعذر تعديل وضع الحراسة' },
      { status: 500 }
    );
  }
}
