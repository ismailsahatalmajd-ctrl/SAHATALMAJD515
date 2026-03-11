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
  absence: "غياب",
  leave: "إجازة",
  official_event: "مناسبة رسمية"
}

const categoryLabelsAr: Record<string, string> = {
  unexcused: "بدون عذر",
  excused: "بعذر",
  sick: "مرضي",
  official: "رسمية",
  eid: "عيد",
  national: "يوم وطني",
  work_visit: "زيارة عمل",
  training: "تدريب"
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
              <th>ملاحظات / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${record.employeeName}</td>
              <td>${convertNumbersToEnglish(record.date)}</td>
              <td>${typeLabelsAr[record.type] || record.type}</td>
              <td>${categoryLabelsAr[record.category] || record.category}</td>
              <td>${record.notes || "لا يوجد"}</td>
            </tr>
          </tbody>
        </table>

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
      <td>${r.notes || "-"}</td>
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
