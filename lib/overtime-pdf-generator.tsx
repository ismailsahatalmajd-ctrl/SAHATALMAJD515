import { OvertimeEntry } from "./types"
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

export async function generateOvertimePDF(entry: OvertimeEntry): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  const empNames = entry.employeeNames || [(entry as any).employeeName].filter(Boolean)
  const reasonsList = entry.reasons || [(entry as any).reason].filter(Boolean)

  // Check if we have individual employee details
  const hasIndividualDetails = entry.employeeDetails && entry.employeeDetails.length > 0

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 15px; 
            max-width: 210mm; 
            margin: 0 auto; 
            color: #000;
            background: #fff;
            direction: rtl;
          }
          .header-top { text-align: center; margin-bottom: 5px; display: flex; flex-direction: column; align-items: center; }
          .logo { width: 80px; height: auto; margin-bottom: 5px; }
          .brand-name { font-size: 14px; color: #666; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; }
          
          .main-title-bar { 
            background-color: #798da3; 
            color: white; 
            padding: 6px; 
            text-align: center; 
            font-size: 15px; 
            font-weight: bold; 
            margin-bottom: 12px; 
            border: 1.5px solid #000; 
          }

          .form-outer-border { border: 2px solid #000; margin-bottom: 12px; }
          .section-title { 
            background-color: #1a2a44; 
            color: white; 
            text-align: center; 
            padding: 4px; 
            font-weight: bold; 
            font-size: 13px; 
            border-bottom: 1.5px solid #000; 
          }

          .content-area-names { 
            padding: 10px 20px; 
            min-height: 80px; 
            border-bottom: 1.5px solid #000; 
            font-size: 13px; 
            font-weight: 600; 
            text-align: left;
            direction: ltr;
          }
          .content-area-names div { margin-bottom: 2px; }

          .data-row { border-bottom: 1.5px solid #000; display: flex; align-items: center; }
          .row-label { 
            width: 35%; 
            padding: 6px; 
            font-weight: bold; 
            font-size: 12px; 
            border-right: 1.5px solid #000; 
            background: #f8f8f8; 
            text-align: center;
          }
          .row-value { 
            width: 65%; 
            padding: 6px; 
            text-align: center; 
            font-size: 13px; 
            font-weight: 500; 
          }

          .reason-box { padding: 8px; text-align: center; min-height: 40px; font-weight: 700; font-size: 14px; }

          /* Individual employee details styles */
          .employee-details-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 10px 0;
            font-size: 11px;
          }
          .employee-details-table th, 
          .employee-details-table td { 
            border: 1px solid #000; 
            padding: 4px; 
            text-align: center;
          }
          .employee-details-table th { 
            background-color: #1a2a44; 
            color: white; 
            font-weight: bold;
          }
          .employee-details-table .emp-name { 
            text-align: right; 
            font-weight: bold;
            direction: ltr;
          }
          .employee-details-table .emp-reasons { 
            text-align: right; 
            font-size: 10px;
            direction: ltr;
          }

          .approval-box { border: 2.5px solid #1a2a44; margin-bottom: 8px; overflow: hidden; border-radius: 4px; }
          .approval-header { background-color: #1a2a44; color: white; text-align: center; padding: 4px; font-weight: bold; font-size: 13px; border-bottom: 1.5px solid #000; }
          .approval-content { display: flex; flex-direction: column; }
          .approval-checks { display: flex; justify-content: space-around; padding: 6px; border-bottom: 1.5px solid #000; font-size: 12px; font-weight: bold; }
          .check-item { display: flex; align-items: center; gap: 10px; }
          .check-rect { width: 35px; height: 18px; border: 2px solid #000; }
          .sig-row { display: flex; border-bottom: none; }
          .sig-cell { width: 50%; padding: 6px; text-align: center; font-size: 11px; }
          .sig-label { font-weight: bold; margin-bottom: 20px; }
          .dotted-line { border-bottom: 1.5px dotted #000; width: 85%; margin: 8px auto; }

          /* HR Box Highlight */
          .hr-approval { border-color: #1a2a44; }
          .hr-bg { background-color: #1a2a44; }
        </style>
      </head>
      <body>
        <div class="header-top">
          <img src="${logoUrl}" class="logo" />
          <div class="brand-name">SAHAT ALMAJD</div>
        </div>
        
        <div class="main-title-bar">نموذج طلب ساعات إضافية | OverTime Request Form</div>
        
        <div class="form-outer-border">
          <div class="section-title">الأسماء / Names</div>
          <div class="content-area-names">
            ${empNames.map((name: string, i: number) => `<div>${i + 1} – ${name}</div>`).join("")}
          </div>
          
          <div class="section-title">القسم / Department</div>
          <div class="row-value" style="width:100%; border-bottom: 1.5px solid #000; background:#fff; font-weight:bold;">${entry.department === 'Warehouse' ? 'مستودع هنوفرين / Hanoverian Warehouse' : entry.department}</div>
          
          <div class="data-row">
            <div class="row-value">${convertNumbersToEnglish(formatDate(entry.date))}</div>
            <div class="row-label">تاريخ الطلب / Request Date</div>
          </div>
          
          ${!hasIndividualDetails ? `
            <div class="data-row">
              <div class="row-value">${convertNumbersToEnglish(entry.fromTime)}</div>
              <div class="row-label">من الساعة / From Time</div>
            </div>
            <div class="data-row">
              <div class="row-value">${convertNumbersToEnglish(entry.toTime)}</div>
              <div class="row-label">إلى الساعة / To Time</div>
            </div>
          ` : ''}
          
          ${hasIndividualDetails ? `
            <div class="section-title">تفاصيل الساعات الإضافية للموظفين / Individual Employee Overtime Details</div>
            <table class="employee-details-table">
              <thead>
                <tr>
                  <th>الموظف / Employee</th>
                  <th>من / From</th>
                  <th>إلى / To</th>
                  <th>الساعات / Hours</th>
                  <th>الأسباب / Reasons</th>
                </tr>
              </thead>
              <tbody>
                ${entry.employeeDetails?.map(emp => `
                  <tr>
                    <td class="emp-name">${emp.employeeName}</td>
                    <td>${convertNumbersToEnglish(emp.fromTime)}</td>
                    <td>${convertNumbersToEnglish(emp.toTime)}</td>
                    <td style="font-weight: bold;">${convertNumbersToEnglish(emp.totalHours)}</td>
                    <td class="emp-reasons">${emp.reasons.join(" / ")}</td>
                  </tr>
                `).join("") || ""}
              </tbody>
            </table>
          ` : ''}
          
          <div class="section-title">سبب الساعات الإضافية / Reason for OverTime</div>
          <div class="reason-box">
            ${(() => {
              if (!hasIndividualDetails) {
                return reasonsList.join(" / ")
              }
              
              // Collect all unique reasons from both general and individual employee reasons
              const allReasons = new Set<string>()
              
              // Add general reasons
              reasonsList.forEach(reason => allReasons.add(reason))
              
              // Add individual employee reasons
              entry.employeeDetails?.forEach(emp => {
                emp.reasons.forEach(reason => allReasons.add(reason))
              })
              
              // Convert to array and sort
              const uniqueReasons = Array.from(allReasons).sort()
              
              // Display as numbered list
              return uniqueReasons.map((reason, index) => 
                `<div style="margin: 2px 0; font-size: 13px;">
                  <span style="font-weight: bold;">${index + 1}.</span> 
                  <span>${reason}</span>
                </div>`
              ).join('')
            })()}
          </div>
        </div>

        <!-- Manager Approval -->
        <div class="approval-box">
          <div class="approval-header">موافقة المدير / Manager Approve</div>
          <div class="approval-content">
            <div class="approval-checks">
               <div class="check-item"><span>Not Approve</span><div class="check-rect"></div></div>
               <div class="check-item"><span>Approve</span><div class="check-rect"></div></div>
            </div>
            <div class="sig-row">
              <div class="sig-cell" style="border-left: 1.5px solid #000;">
                 <div class="sig-label">اسم المدير / Manager Name</div>
                 <div class="dotted-line"></div>
              </div>
              <div class="sig-cell">
                 <div class="sig-label">التوقيع / Signature</div>
                 <div class="dotted-line"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- HR Approval Box - Restored -->
        <div class="approval-box hr-approval">
          <div class="approval-header hr-bg">موافقة الموارد البشرية / HR Approve</div>
          <div class="approval-content">
            <div class="approval-checks">
               <div class="check-item"><span>Not Approve</span><div class="check-rect"></div></div>
               <div class="check-item"><span>Approve</span><div class="check-rect"></div></div>
            </div>
            <div class="sig-row">
              <div class="sig-cell" style="border-left: 1.5px solid #000;">
                 <div class="sig-label">اسم المسؤول / HR Name</div>
                 <div class="dotted-line"></div>
              </div>
              <div class="sig-cell">
                 <div class="sig-label">التوقيع / Signature</div>
                 <div class="dotted-line"></div>
              </div>
            </div>
          </div>
        </div>

      </body>
    </html>
  `
  openPrintWindow(html, `Overtime Request - ${empNames[0] || 'Unknown'}`)
}

export async function generateOvertimeReportPDF(entries: OvertimeEntry[], filterMonth: string, employeeName: string, mode: 'detailed' | 'merged'): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  const totalGrandHours = entries.reduce((sum, e) => {
    return sum + (e.grandTotalHours || 0)
  }, 0)

  let rowsHtml = ""
  let tableHeader = ""

  if (mode === 'detailed') {
    tableHeader = `
      <tr>
        <th style="width: 80px;">تاريخ Date</th>
        <th>الأسماء Employees</th>
        <th style="width: 50px;">من From</th>
        <th style="width: 50px;">إلى To</th>
        <th style="width: 40px;">ساعات Hrs</th>
        <th>الأسباب Reasons</th>
      </tr>
    `
    rowsHtml = entries.map((e) => {
      const eNames = e.employeeNames || [(e as any).employeeName].filter(Boolean)
      const eReasons = e.reasons || [(e as any).reason].filter(Boolean)
      
      // Check if we have individual employee details
      if (e.employeeDetails && e.employeeDetails.length > 0) {
        return e.employeeDetails.map(emp => `
          <tr>
            <td>${convertNumbersToEnglish(e.date || '')}</td>
            <td style="text-align:right; font-weight:bold">${emp.employeeName}</td>
            <td>${convertNumbersToEnglish(emp.fromTime)}</td>
            <td>${convertNumbersToEnglish(emp.toTime)}</td>
            <td style="font-weight:bold">${convertNumbersToEnglish(emp.totalHours)}</td>
            <td style="text-align:right; font-size:10px">${emp.reasons.join(" / ")}</td>
          </tr>
        `).join("")
      } else {
        return `
          <tr>
            <td>${convertNumbersToEnglish(e.date || '')}</td>
            <td style="text-align:right">${eNames.join(", ")}</td>
            <td>${convertNumbersToEnglish(e.fromTime || '')}</td>
            <td>${convertNumbersToEnglish(e.toTime || '')}</td>
            <td style="font-weight:bold">${convertNumbersToEnglish(e.totalHours || 0)}</td>
            <td style="text-align:right; font-size:10px">${eReasons.join(" / ")}</td>
          </tr>
        `
      }
    }).join("")
  } else {
    tableHeader = `
      <tr>
        <th style="width: 90px;">تاريخ Date</th>
        <th>اسم الموظف Employee</th>
        <th style="width: 60px;">من From</th>
        <th style="width: 60px;">إلى To</th>
        <th style="width: 50px;">ساعات Hrs</th>
        <th style="width: 70px;">الإجمالي Total</th>
        <th>الأسباب Reasons</th>
      </tr>
    `
    
    // Collect all individual employee entries from employeeDetails
    const allEmployeeEntries: Array<{
      name: string,
      date: string,
      fromTime: string,
      toTime: string,
      totalHours: number,
      reasons: string[]
    }> = []
    
    entries.forEach(e => {
      if (e.employeeDetails && e.employeeDetails.length > 0) {
        // Use individual details if available
        e.employeeDetails.forEach(emp => {
          allEmployeeEntries.push({
            name: emp.employeeName,
            date: e.date || '',
            fromTime: emp.fromTime,
            toTime: emp.toTime,
            totalHours: emp.totalHours,
            reasons: emp.reasons
          })
        })
      } else {
        // Fallback to old format
        const names = e.employeeNames || [(e as any).employeeName].filter(Boolean)
        names.forEach(name => {
          allEmployeeEntries.push({
            name,
            date: e.date || '',
            fromTime: e.fromTime || '',
            toTime: e.toTime || '',
            totalHours: e.totalHours || 0,
            reasons: e.reasons || [(e as any).reason].filter(Boolean)
          })
        })
      }
    })
    
    // Group by employee name
    const nameGroups = allEmployeeEntries.reduce((groups, entry) => {
      if (!groups[entry.name]) {
        groups[entry.name] = []
      }
      groups[entry.name].push(entry)
      return groups
    }, {} as Record<string, typeof allEmployeeEntries>)
    
    const nameList = Object.keys(nameGroups).sort()

    nameList.forEach(name => {
        const empEntries = nameGroups[name].sort((a,b) => a.date.localeCompare(b.date))
        
        if (empEntries.length === 0) return
        const empTotal = empEntries.reduce((sum, e) => sum + e.totalHours, 0)

        empEntries.forEach((e, idx) => {
            rowsHtml += `
                <tr>
                    <td>${convertNumbersToEnglish(e.date)}</td>
                    ${idx === 0 ? `<td rowspan="${empEntries.length}" style="font-weight:bold; background:#fff; font-size:12px; text-align:left; direction:ltr;">${name}</td>` : ''}
                    <td>${convertNumbersToEnglish(e.fromTime)}</td>
                    <td>${convertNumbersToEnglish(e.toTime)}</td>
                    <td>${convertNumbersToEnglish(e.totalHours)}</td>
                    ${idx === 0 ? `<td rowspan="${empEntries.length}" style="font-size: 16px; font-weight: 900; background: #fff; color: #1a2a44;">${convertNumbersToEnglish(empTotal)}</td>` : ''}
                    <td style="text-align:right; font-size:10px">${e.reasons.join(" / ")}</td>
                </tr>
            `
        })
    })
  }

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 10px; direction: rtl; color: #333; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1a2a44; padding-bottom: 15px; }
          .logo { width: 100px; margin-bottom: 10px; }
          h2 { margin: 5px 0; color: #1a2a44; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; table-layout: fixed; }
          th, td { border: 1px solid #aaa; padding: 6px; text-align: center; overflow: hidden; word-wrap: break-word; }
          th { background-color: #1a2a44; color: white; font-weight: bold; font-size: 11px; }
          tr:nth-child(even) { background-color: #fcfcfc; }
          .summary { margin-top: 25px; border-top: 2px solid #1a2a44; padding-top: 15px; display: flex; justify-content: space-between; align-items: center; }
          .total-box { font-size: 18px; font-weight: 900; color: #1a2a44; border: 3px solid #1a2a44; padding: 10px 25px; border-radius: 4px; }
          .badge-mode { background: #1a2a44; color: white; padding: 3px 12px; border-radius: 4px; font-size: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
          <h2>كشف الساعات الإضافية / Overtime Report</h2>
          <div style="display:flex; justify-content:center; gap:25px; font-size:13px; margin-top:10px; font-weight:600;">
            <span>الفترة: ${convertNumbersToEnglish(filterMonth)}</span>
            <span>الموظف: ${employeeName}</span>
            <span class="badge-mode">${mode === 'merged' ? 'طباعة مدمجة (حسب الموظف)' : 'طباعة مفصلة (حسب الطلب)'}</span>
          </div>
        </div>

        <table>
          <thead>
            ${tableHeader}
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7">لا توجد بيانات</td></tr>'}
          </tbody>
        </table>

        <div class="summary">
           <div style="font-size: 10px; color: #777;">
            * تم استخراج هذا التقرير تلقائياً من النظام.<br/>
            * إجمالي الساعات الظاهر في الأسفل هو مجموع كل الساعات المسجلة في هذا الكشف.
           </div>
           <div class="total-box">مجموع ساعات التقرير: ${convertNumbersToEnglish(totalGrandHours)} Hr</div>
        </div>
      </body>
    </html>
  `

  openPrintWindow(html, `Overtime Report ${mode} - ${filterMonth}`)
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  } catch(e) { return dateStr; }
}
