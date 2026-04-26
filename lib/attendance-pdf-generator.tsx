import { AbsenceRecord } from "./types"
import { convertNumbersToEnglish } from "./utils"

/**
 * Helper to ensure we don't try to open the window multiple times or write before it's ready.
 */
function openPrintWindow(html: string, title: string) {
  if (typeof window === "undefined") return

  const w = window.open("", "_blank")
  if (!w) {
    alert("Please allow popups to print / يرجى السماح بالنوافذ المنبثقة للطباعة")
    return
  }

  w.document.open()
  w.document.write(html)
  w.document.close()
  
  w.document.title = title

  w.onload = () => {
    setTimeout(() => {
      w.print()
    }, 500)
  }
}

const typeLabelsAr: Record<string, string> = {
  absence: "غياب / Absence",
  leave: "إجازة / Leave",
  official_event: "مناسبة رسمية / Official Event",
  attendance: "حضور / Attendance"
}

const categoryLabelsAr: Record<string, string> = {
  unexcused: "بدون عذر / Unexcused",
  excused: "بعذر / Excused",
  sick: "مرضي / Sick",
  official: "رسمية / Official",
  eid: "عيد / Eid",
  national: "يوم وطني / National Day",
  work_visit: "زيارة عمل / Work Visit",
  training: "تدريب / Training",
  fingerprint: "بصمة / Fingerprint",
  manual: "يدوي / Manual"
}

export async function generateAttendancePDF(record: AbsenceRecord): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 20px; 
            max-width: 210mm; 
            margin: 0 auto; 
            direction: rtl;
          }
          .header { text-align: center; margin-bottom: 20px; }
          .logo { width: 90px; margin-bottom: 5px; }
          .title { font-size: 20px; font-weight: bold; border: 2px solid #000; padding: 10px; margin-bottom: 20px; background: #f0f0f0; }
          
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .info-table th, .info-table td { border: 1.5px solid #000; padding: 10px; text-align: right; }
          .info-table th { background: #e0e0e0; width: 30%; font-weight: bold; }
          
          .footer { margin-top: 50px; display: flex; justify-content: space-around; }
          .signature { border-top: 1px dotted #000; padding-top: 10px; width: 200px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
          <div style="font-weight:bold; font-size:16px;">مستودع ساحة المجد | SAHAT ALMAJD</div>
        </div>
        
        <div class="title" style="text-align:center;">إشعار غياب / إجازة | Absence/Leave Notice</div>
        
        <table class="info-table text-center">
          <thead>
            <tr>
              <th>اسم الموظف / Employee</th>
              <th>التاريخ / Date</th>
              <th>النوع / Record Type</th>
              <th>التصنيف / Category</th>
              <th>العذر / Excuse</th>
              <th>ملاحظات / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${record.employeeName}</td>
              <td>${convertNumbersToEnglish(record.date)}</td>
              <td>${typeLabelsAr[record.type] || record.type}</td>
              <td>${categoryLabelsAr[record.category] || record.category}</td>
              <td>${record.excuse || "-"}</td>
              <td>${record.notes || "لا يوجد / None"}</td>
            </tr>
          </tbody>
        </table>

        ${record.attachmentUrl ? `
        <div style="margin-top: 20px; text-align: center;">
          <div style="font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">المرفقات / Attachment:</div>
          <img src="${record.attachmentUrl}" style="max-width: 100%; max-height: 400px; border: 1px solid #ccc; border-radius: 8px; padding: 5px;" />
        </div>
        ` : ''}

        <div class="footer">
          <div class="signature">توقيع الموظف / Employee</div>
          <div class="signature">اعتماد الإدارة / Management</div>
        </div>
      </body>
    </html>
  `
  openPrintWindow(html, `Attendance Record - ${record.employeeName}`)
}

export async function generateAttendanceReportPDF(records: AbsenceRecord[], filterMonth: string): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`

  const rowsHtml = records.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.employeeName}</td>
      <td>${convertNumbersToEnglish(r.date)}</td>
      <td>${typeLabelsAr[r.type] || r.type}</td>
      <td>${categoryLabelsAr[r.category] || r.category}</td>
      <td>
        ${r.excuse ? `<div style="font-weight:bold;">العذر: ${r.excuse}</div>` : ''}
        ${r.notes || "-"}
        ${r.attachmentUrl ? `<div style="color: blue; font-size: 10px;">[يوجد مرفق / Has Attachment]</div>` : ''}
      </td>
    </tr>
  `).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; padding: 10px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .logo { width: 80px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #000; padding: 5px; text-align: center; }
          th { background: #eee; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
          <h2>تقرير الغياب والإجازات - شهر ${convertNumbersToEnglish(filterMonth)}</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>الموظف</th>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>التصنيف</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6">لا توجد سجلات</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `
  openPrintWindow(html, `Attendance Report - ${filterMonth}`)
}

export async function generateZkAttendanceReportPDF(
  summary: Array<{ 
    employeeName: string; 
    date: string; 
    firstSwipe: string; 
    lastSwipe: string; 
    count: number;
    duration: string;
    branchName?: string;
  }>, 
  titleSuffix: string = ""
): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`

  const rowsHtml = summary.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-weight:bold; text-align:right;">${s.employeeName}</td>
      <td>${convertNumbersToEnglish(s.date)}</td>
      <td style="color: blue; font-weight:bold;">${s.firstSwipe}</td>
      <td style="color: #c05621; font-weight:bold;">${s.count > 1 ? s.lastSwipe : '<span style="color:#d9534f; font-size:10px;">لم يتم التبصيم</span>'}</td>
      <td>${s.count}</td>
      <td style="font-weight:bold; color: #38a169;">${s.duration}</td>
      <td>${s.branchName || '-'}</td>
    </tr>
  `).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; padding: 10px; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #222; padding-bottom: 10px; }
          .logo { width: 70px; }
          .report-title { text-align: center; margin: 20px 0; background: #f8f8f8; padding: 10px; border: 1px solid #ddd; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #444; padding: 10px; text-align: center; }
          th { background: #f0f0f0; font-weight: bold; }
          .footer { margin-top: 40px; text-align: left; font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="text-align: right;">
            <div style="font-weight: bold; font-size: 16px;">مستودع ساحة المجد</div>
            <div style="font-size: 12px; color: #555;">Human Resources Department</div>
          </div>
          <img src="${logoUrl}" class="logo" />
          <div style="text-align: left;">
            <div style="font-weight: bold;">تاريخ الطباعة</div>
            <div>${new Date().toLocaleDateString('ar-EG')}</div>
          </div>
        </div>
        
        <div class="report-title">
          <h2 style="margin:0;">خلاصة حضور وانصراف جهاز البصمة</h2>
          <div style="font-size: 14px; margin-top:5px;">${titleSuffix}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>اسم الموظف</th>
              <th>التاريخ</th>
              <th>وقت الحضور (In)</th>
              <th>وقت الانصراف (Out)</th>
              <th>البصمات</th>
              <th>الساعات</th>
              <th>الفرع</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8">لا توجد سجلات مزامنة حالياً / No synced records found</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 50px; display: flex; justify-content: space-around;">
          <div style="text-align:center; width:150px; border-top:1px solid #000; padding-top:5px;">توقيع مراقب الدوام</div>
          <div style="text-align:center; width:150px; border-top:1px solid #000; padding-top:5px;">اعتماد مدير الموارد البشرية</div>
        </div>

        <div class="footer">
          تم إنشاء هذا التقرير تلقائياً عبر نظام إدارة ساحة المجد - MB20-VL System
        </div>
      </body>
    </html>
  `
  openPrintWindow(html, `ZKTeco Summary Report`)
}

export async function generatePerformanceSummaryPDF(
  data: Array<{
    name: string;
    workingDays: number;
    totalHours: string;
    absenceDays: number;
    missingSwipes: number;
  }>,
  startDate: string,
  endDate: string
): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  
  const rowsHtml = data.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="text-align:right; font-weight:bold;">${d.name}</td>
      <td>${d.workingDays}</td>
      <td style="font-weight:bold; color: #38a169;">${d.totalHours}</td>
      <td style="color: #d9534f;">${d.absenceDays}</td>
      <td style="color: #c05621;">${d.missingSwipes}</td>
    </tr>
  `).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; padding: 10px; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #222; padding-bottom: 5px; }
          .logo { width: 60px; }
          .report-banner { 
            text-align: center; 
            margin: 15px 0; 
            background: #eef2ff; 
            padding: 20px; 
            border: 1.5px solid #6366f1; 
            border-radius: 8px;
            color: #1e1b4b;
          }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
          th, td { border: 1.5px solid #444; padding: 12px; text-align: center; }
          th { background: #f1f5f9; font-weight: bold; }
          .footer { margin-top: 60px; display: flex; justify-content: space-around; text-align: center; }
          .sig-box { width: 180px; border-top: 1px solid #000; padding-top: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="text-align: right;">
            <div style="font-weight: bold; font-size: 14px;">مستودع ساحة المجد</div>
            <div style="font-size: 11px;">HR Management | إدارة الموارد البشرية</div>
          </div>
          <img src="${logoUrl}" class="logo" />
          <div style="text-align: left;">
            <div style="font-weight: bold; font-size: 12px;">تاريخ الإصدار</div>
            <div style="font-size: 12px;">${convertNumbersToEnglish(startDate)} - ${convertNumbersToEnglish(endDate)}</div>
          </div>
        </div>
        
        <div class="report-banner">
          <h1 style="margin:0; font-size: 24px;">خلاصة الأداء وعمليات التبصيم</h1>
          <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">الفترة: ${startDate} -> ${endDate}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>اسم الموظف</th>
              <th>أيام الدوام</th>
              <th>إجمالي الساعات</th>
              <th>أيام الغياب</th>
              <th>بصمات ناقصة</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6">لا توجد سجلات كافية لهذه الفترة</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <div class="sig-box">
            <div style="font-weight:bold;">معد التقرير</div>
            <div style="margin-top:20px; font-size: 12px; color: #888;">التوقيع</div>
          </div>
          <div class="sig-box">
            <div style="font-weight:bold;">مدير الموارد البشرية</div>
            <div style="margin-top:20px; font-size: 12px; color: #888;">الختم والاعتماد</div>
          </div>
        </div>
      </body>
    </html>
  `
  openPrintWindow(html, `Employee Performance Summary`)
}
