import { BranchInventoryReport } from "./types"
import { convertNumbersToEnglish } from "./utils"

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

export async function generateInventoryReportPDF(report: BranchInventoryReport): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  
  let totalValue = 0
  const rowsHtml = report.items.map((item, i) => {
    const itemPrice = item.price || 0
    const rowTotal = itemPrice * item.quantity
    totalValue += rowTotal
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right; font-weight:bold;">${item.productName}</td>
        <td style="font-weight:bold;">${item.quantity}</td>
        <td style="color: #6366f1; font-weight:bold;">${item.unit}</td>
        <td style="color: #c05621; font-weight:bold;">${item.optionalUnit || '-'}</td>
        <td style="font-weight:bold; color: #10b981;">${itemPrice}</td>
        <td style="font-weight:bold; color: #059669;">${rowTotal.toFixed(2)}</td>
        <td style="font-size: 11px; text-align:right;">${item.notes || '-'}</td>
      </tr>
    `
  }).join("")

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
            background: #fdf2f8; 
            padding: 20px; 
            border: 1.5px solid #db2777; 
            border-radius: 8px;
            color: #831843;
          }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
          th, td { border: 1.5px solid #444; padding: 12px; text-align: center; }
          th { background: #fdf2f8; font-weight: bold; }
          .footer { margin-top: 60px; display: flex; justify-content: space-around; text-align: center; }
          .sig-box { width: 180px; border-top: 1px solid #000; padding-top: 5px; }
          .report-info { font-size: 12px; margin-top: 10px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="text-align: right;">
            <div style="font-weight: bold; font-size: 14px;">مستودع ساحة المجد</div>
            <div style="font-size: 11px;">Branch Operations | جرد الفروع</div>
          </div>
          <img src="${logoUrl}" class="logo" />
          <div style="text-align: left;">
            <div style="font-weight: bold; font-size: 12px;">كود العملية</div>
            <div style="font-size: 14px; font-weight: bold; color: #db2777;">${report.reportCode}</div>
          </div>
        </div>
        
        <div class="report-banner">
          <h1 style="margin:0; font-size: 24px;">تقرير جرد المنتجات في الفرع</h1>
          <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">Branch: ${report.branchName}</div>
        </div>

        <div class="report-info">
          <div>تاريخ الجرد: ${convertNumbersToEnglish(new Date(report.createdAt).toLocaleDateString('ar-EG'))}</div>
          <div>الفرع: ${report.branchName}</div>
          <div>معرف التقرير: ${report.id}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>اسم المنتج</th>
              <th style="width:60px;">الكمية</th>
              <th style="width:80px;">الواحدة 1</th>
              <th style="width:100px;">الواحدة 2</th>
              <th style="width:80px;">السعر</th>
              <th style="width:100px;">الإجمالي</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8">لا توجد سجلات مضافة</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #fef2f2; font-weight: bold; font-size: 16px;">
              <td colspan="6" style="text-align: left; padding: 15px;">إجمالي القيمة / Grand Total:</td>
              <td style="color: #db2777; border: 2px solid #db2777;">${totalValue.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        ${report.notes ? `<div style="margin-top: 20px; font-size: 12px; padding: 10px; border: 1px dashed #ccc;"><strong>ملاحظات:</strong> ${report.notes}</div>` : ''}

        <div class="footer">
          <div class="sig-box">
            <div style="font-weight:bold;">معد الجرد (الفرع)</div>
            <div style="margin-top:20px; font-size: 12px; color: #888;">التوقيع</div>
          </div>
          <div class="sig-box">
            <div style="font-weight:bold;">مدير المستودع</div>
            <div style="margin-top:20px; font-size: 12px; color: #888;">الختم والاعتماد</div>
          </div>
        </div>
      </body>
    </html>
  `
  openPrintWindow(html, `Inventory Report - ${report.reportCode}`)
}
